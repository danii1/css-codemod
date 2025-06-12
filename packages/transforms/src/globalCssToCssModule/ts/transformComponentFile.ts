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

export function transformComponentFile(options: TransformComponentFileOptions): boolean {
  const { tsSourceFile, exportNameMap, cssModuleFileName } = options

  // Skip transformation entirely if the component uses dynamic class names
  if (hasDynamicClassNames(tsSourceFile)) {
    signale.info(`Skipping transformation of ${tsSourceFile.getFilePath()} - contains dynamic class names`)
    return false
  }

  // Object to collect CSS classes usage and report unused classes after the codemod.
  const usageStats = Object.fromEntries(
    Object.keys(exportNameMap).map(className => {
      return [className, false]
    })
  )

  let areAllNodesProcessed = false

  while (!areAllNodesProcessed) {
    // `processNodesWithClassName` returns `true` when there's nothing more to process.
    areAllNodesProcessed = processNodesWithClassName({
      usageStats,
      exportNameMap,
      nodesWithClassName: getNodesWithClassName(tsSourceFile),
    })
  }

  const unusedClassNames = Object.entries(usageStats)
    .map(([className, isUsed]) => {
      return isUsed ? undefined : className
    })
    .filter(isDefined)

  if (unusedClassNames.length > 0) {
    signale.warn(`Unused CSS classes in ${cssModuleFileName}`, unusedClassNames)
  }

  return true
}
