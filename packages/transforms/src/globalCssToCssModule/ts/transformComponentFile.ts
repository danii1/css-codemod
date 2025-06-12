import signale from 'signale'
import { SourceFile, SyntaxKind } from 'ts-morph'

import { isDefined } from '@sourcegraph/codemod-common'

import { getNodesWithClassName } from './getNodesWithClassName'
import { processNodesWithClassName } from './processNodesWithClassName'

interface TransformComponentFileOptions {
  tsSourceFile: SourceFile
  exportNameMap: Record<string, string>
  cssModuleFileName: string
}

/**
 * Check if the component uses dynamic class names in template literals.
 * If dynamic parts are found, we skip transformation entirely.
 */
function hasDynamicClassNames(sourceFile: SourceFile): boolean {
  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  const classNameJsxAttributes = jsxAttributes.filter(identifier => {
    return identifier.getName() === 'className'
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
    const classNameStringValue =
      nodeWithClassName.getKind() === SyntaxKind.StringLiteral
        ? (nodeWithClassName as any).getLiteralText()
        : nodeWithClassName.getText()

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

export function transformComponentFile(options: TransformComponentFileOptions): boolean {
  const { tsSourceFile, exportNameMap, cssModuleFileName } = options

  // Skip transformation entirely if the component uses dynamic class names
  if (hasDynamicClassNames(tsSourceFile)) {
    signale.info(`Skipping transformation of ${tsSourceFile.getFilePath()} - contains dynamic class names`)
    return false
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
    return false
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

  return true
}
