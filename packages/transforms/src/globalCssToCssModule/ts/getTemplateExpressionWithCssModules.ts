import { ts, TemplateExpression, NoSubstitutionTemplateLiteral } from 'ts-morph'

import { wrapIntoClassNamesUtility } from '@sourcegraph/codemod-toolkit-packages'

import { STYLES_IDENTIFIER } from './processNodesWithClassName'
import { splitClassName } from './splitClassName'

interface GetTemplateExpressionWithCssModulesOptions {
  templateExpression: TemplateExpression | NoSubstitutionTemplateLiteral
  exportNameMap: Record<string, string>
  usageStats: Record<string, boolean>
}

/**
 * Transform template expressions in className attributes to use CSS modules.
 * 
 * Only transforms template literals without dynamic parts (NoSubstitutionTemplateLiteral).
 * Template literals with dynamic parts are skipped to avoid incorrect transformations
 * of partial class names.
 * 
 * Example:
 * - `MyTeam_Badge d-flex` → classNames("d-flex", styles.myTeamBadge) ✅
 * - `MyTeam_Badge--${role}` → not transformed (skipped) ✅
 */
export function getTemplateExpressionWithCssModules(
  options: GetTemplateExpressionWithCssModulesOptions
): ts.CallExpression | null {
  const { templateExpression, exportNameMap, usageStats } = options

  // Handle both TemplateExpression and NoSubstitutionTemplateLiteral
  let head: string
  let templateSpans: any[] = []

  if (templateExpression instanceof NoSubstitutionTemplateLiteral) {
    head = templateExpression.compilerNode.rawText?.trim() || ''
    templateSpans = [] // No substitutions
  } else {
    head = templateExpression.getHead().compilerNode.rawText?.trim() || ''
    templateSpans = templateExpression.getTemplateSpans()
  }

  // Abort conversion if template literal has dynamic parts
  // This prevents incorrect transformation of partial class names
  if (templateSpans.length > 0) {
    return null
  }

  // If there's no static content in the head, we can't transform it
  if (!head) {
    return null
  }

  const { exportNames, leftOverClassnames } = splitClassName({
    className: head,
    exportNameMap,
    usageStats,
  })

  // If no classes match the export map, don't transform
  if (exportNames.length === 0) {
    return null
  }

  const classNamesArguments: ts.Expression[] = []

  // Only handle template literals with no dynamic parts
  // Add leftover classes as string literal if any
  if (leftOverClassnames.length > 0) {
    classNamesArguments.push(ts.factory.createStringLiteral(leftOverClassnames.join(' ')))
  }

  // Add CSS module references for matched classes
  exportNames.forEach(exportName => {
    classNamesArguments.push(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier(STYLES_IDENTIFIER),
        exportName
      )
    )
  })

  return wrapIntoClassNamesUtility(classNamesArguments)
}

