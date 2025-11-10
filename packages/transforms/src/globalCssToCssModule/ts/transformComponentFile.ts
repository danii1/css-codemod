import signale from 'signale'
import { SourceFile, SyntaxKind } from 'ts-morph'

import { isDefined } from '@sourcegraph/codemod-common'

import { getNodesWithClassName } from './getNodesWithClassName'
import { processNodesWithClassName } from './processNodesWithClassName'
import { splitClassName } from './splitClassName'

export interface TransformComponentFileOptions {
  tsSourceFile: SourceFile
  exportNameMap: Record<string, string>
  cssModuleFileName?: string
  globalClassNames?: Set<string>
}

export interface TransformResult {
  success: boolean
  reason?: string
  unusedClasses?: string[]
  globalClasses?: string[]
}

/**
 * Check if the component uses dynamic class names in template literals.
 * If dynamic parts are found, we skip transformation entirely.
 */
function hasDynamicClassNames(sourceFile: SourceFile): boolean {
  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  const classNameJsxAttributes = jsxAttributes.filter(identifier => {
    return /classnames?$/i.test(identifier.getName())
  })

  // Check for template expressions (template literals with dynamic parts)
  const templateExpressions = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.TemplateExpression)
  })

  return templateExpressions.length > 0
}

/**
 * Check which CSS classes are used in the component without modifying the source file.
 */
function getUsageStats(tsSourceFile: SourceFile, exportNameMap: Record<string, string>): Record<string, boolean> {
  const usageStats = Object.fromEntries(
    Object.keys(exportNameMap).map(className => {
      return [className, false]
    })
  )

  // Get all className nodes and check which classes are used
  const nodesWithClassName = getNodesWithClassName(tsSourceFile)

  for (const nodeWithClassName of nodesWithClassName) {
    let classNameStringValue: string

    if (nodeWithClassName.getKind() === SyntaxKind.StringLiteral) {
      classNameStringValue = (nodeWithClassName as any).getLiteralText()
    } else if (nodeWithClassName.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
      // For template literals without substitutions, get the raw text content
      classNameStringValue = (nodeWithClassName as any).compilerNode.rawText || ''
    } else {
      // For other types (identifiers, template expressions with substitutions)
      classNameStringValue = nodeWithClassName.getText()
    }

    // Split class names and mark used ones
    const classNames = classNameStringValue.split(' ')
    for (const className of classNames) {
      if (exportNameMap[className]) {
        usageStats[className] = true
      }
    }
  }

  return usageStats
}

/**
 * Check if the transformation would result in global class names remaining in the TSX file.
 * This function simulates the transformation process without modifying the source file.
 */
function hasGlobalClassNamesAfterTransformation(
  tsSourceFile: SourceFile,
  exportNameMap: Record<string, string>,
  globalClassNames: Set<string> = new Set()
): { hasGlobalClasses: boolean; globalClasses: string[] } {
  const nodesWithClassName = getNodesWithClassName(tsSourceFile)
  const globalClasses: string[] = []

  for (const nodeWithClassName of nodesWithClassName) {
    let classNameStringValue: string

    if (nodeWithClassName.getKind() === SyntaxKind.StringLiteral) {
      classNameStringValue = (nodeWithClassName as any).getLiteralText()
    } else if (nodeWithClassName.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
      // For template literals without substitutions, get the raw text content
      classNameStringValue = (nodeWithClassName as any).compilerNode.rawText || ''
    } else {
      // For other types (identifiers, template expressions with substitutions)
      // Skip these as they might contain dynamic content that we can't analyze
      continue
    }

    // Check what would remain after transformation
    const { leftOverClassnames } = splitClassName({
      className: classNameStringValue,
      exportNameMap,
      usageStats: {}, // We don't need to track usage for this check
    })

    // Collect any leftover class names (global classes) that are NOT in the global CSS files
    for (const leftOverClass of leftOverClassnames) {
      const trimmedClass = leftOverClass.trim()
      if (trimmedClass !== '' && !globalClasses.includes(trimmedClass) && !globalClassNames.has(trimmedClass)) {
        globalClasses.push(trimmedClass)
      }
    }
  }

  return {
    hasGlobalClasses: globalClasses.length > 0,
    globalClasses
  }
}

export function transformComponentFile(options: TransformComponentFileOptions): TransformResult {
  const { tsSourceFile, exportNameMap, globalClassNames = new Set() } = options

  // Skip transformation entirely if the component uses dynamic class names
  if (hasDynamicClassNames(tsSourceFile)) {
    signale.info(`Skipping transformation of ${tsSourceFile.getFilePath()} - contains dynamic class names`)
    return { success: false, reason: 'Contains dynamic class names' }
  }

  // Check for unused classes BEFORE doing any transformations
  const usageStats = getUsageStats(tsSourceFile, exportNameMap)

  const unusedClassNames = Object.entries(usageStats)
    .map(([className, isUsed]) => {
      return isUsed ? undefined : className
    })
    .filter(isDefined)

  if (unusedClassNames.length > 0) {
    signale.warn(
      `Skipping transformation of ${tsSourceFile.getFilePath()} - contains unused CSS classes that might be used elsewhere.`,
      `\nUnused classes: ${unusedClassNames.join(', ')}`,
      '\nPlease extract these classes to a separate CSS file or remove them before running the transformation.'
    )
    return { success: false, reason: 'Contains unused CSS classes', unusedClasses: unusedClassNames }
  }

  // Check if transformation would result in global class names remaining
  const { hasGlobalClasses, globalClasses } = hasGlobalClassNamesAfterTransformation(tsSourceFile, exportNameMap, globalClassNames)

  if (hasGlobalClasses) {
    signale.warn(
      `Skipping transformation of ${tsSourceFile.getFilePath()} - transformation would result in global class names remaining.`,
      '\nAll class names in the component must have corresponding CSS module exports for transformation to proceed.',
      '\nPlease ensure all class names are defined in the CSS file, or extract global classes to a separate file.',
      `\nGlobal classes remaining: ${globalClasses.join(', ')}`
    )
    return { success: false, reason: 'Global class names would remain after transformation', globalClasses }
  }

  // Object to collect CSS classes usage during the actual transformation.
  const transformUsageStats = Object.fromEntries(
    Object.keys(exportNameMap).map(className => {
      return [className, false]
    })
  )

  let areAllNodesProcessed = false

  while (!areAllNodesProcessed) {
    // `processNodesWithClassName` returns `true` when there's nothing more to process.
    areAllNodesProcessed = processNodesWithClassName({
      usageStats: transformUsageStats,
      exportNameMap,
      nodesWithClassName: getNodesWithClassName(tsSourceFile),
    })
  }

  return { success: true }
}
