import { Node, ts, SourceFile, CallExpression } from 'ts-morph'

import { addOrUpdateImportIfIdentifierIsUsed, isImportedFromModule } from '@sourcegraph/codemod-toolkit-ts'

export const CLASSNAMES_IDENTIFIER = 'classNames'
export const CLASSNAMES_MODULE_SPECIFIER = CLASSNAMES_IDENTIFIER.toLowerCase()

// Supported className utility modules
export const CLASSNAME_UTILITY_MODULES = ['classnames', 'clsx'] as const

// Common className utility identifier patterns
export const CLASSNAME_UTILITY_IDENTIFIERS = /^(cn|classnames|clsx)$/i

// Wraps an array of arguments in a `classNames` function call.
export function wrapIntoClassNamesUtility(classNames: ts.Expression[]): ts.CallExpression {
  return ts.factory.createCallExpression(ts.factory.createIdentifier(CLASSNAMES_IDENTIFIER), undefined, classNames)
}

// Adds `classnames` import to the `sourceFile` if `classNames` util is used and import doesn't exist.
export function addClassNamesUtilImportIfNeeded(sourceFile: SourceFile): void {
  addOrUpdateImportIfIdentifierIsUsed({
    sourceFile,
    importStructure: {
      defaultImport: CLASSNAMES_IDENTIFIER,
      moduleSpecifier: CLASSNAMES_MODULE_SPECIFIER,
    },
  })
}

/**
 * Checks if an identifier matches common className utility naming patterns.
 * Matches: cn, classNames, clsx (case insensitive)
 */
export function isClassNameUtilityIdentifier(identifierText: string): boolean {
  return CLASSNAME_UTILITY_IDENTIFIERS.test(identifierText)
}

/**
 * Checks if a call expression uses a className utility based on identifier name.
 * This is a fallback when import detection doesn't work.
 */
export function isClassNamesCallExpressionByIdentifier(node?: Node): node is CallExpression {
  if (!Node.isCallExpression(node)) {
    return false
  }

  const expression = node.getExpression()

  if (Node.isIdentifier(expression)) {
    return isClassNameUtilityIdentifier(expression.getText())
  }

  return false
}

/**
 * Hybrid approach: checks both import source and identifier patterns.
 * This provides the most comprehensive detection of className utility calls.
 */
export function isClassNamesCallExpressionHybrid(node?: Node): node is CallExpression {
  if (!Node.isCallExpression(node)) {
    return false
  }

  // First try import-based detection (most reliable)
  const expression = node.getExpression()
  if (isImportedFromClassNameUtilityModule(expression)) {
    return true
  }

  // Fallback to identifier pattern matching
  return isClassNamesCallExpressionByIdentifier(node)
}

/**
 * Checks if a node is imported from any of the supported className utility modules.
 * Supports: classnames, clsx
 */
export function isImportedFromClassNameUtilityModule(node: Node): boolean {
  return CLASSNAME_UTILITY_MODULES.some(moduleSpecifier => { return isImportedFromModule(node, moduleSpecifier) }
  )
}

/**
 * Enhanced version that checks if a call expression is a className utility call.
 * Supports different import aliases and both classnames/clsx modules.
 */
export function isClassNamesCallExpression(node?: Node): node is CallExpression {
  return isClassNamesCallExpressionHybrid(node)
}

// TODO: use type information to verify classNames utility call.
// Legacy function for backward compatibility - now uses the enhanced version
export function isClassNamesCallExpressionLegacy(node?: Node): node is CallExpression {
  return Node.isCallExpression(node) && isImportedFromModule(node.getExpression(), CLASSNAMES_MODULE_SPECIFIER)
}

/**
 * Gets the identifier name being used for a className utility call expression.
 * Returns the actual identifier text (e.g., 'cn', 'clsx', 'classNames').
 */
export function getClassNameUtilityIdentifier(callExpression: CallExpression): string | undefined {
  if (!isClassNamesCallExpression(callExpression)) {
    return undefined
  }

  const expression = callExpression.getExpression()
  if (Node.isIdentifier(expression)) {
    return expression.getText()
  }

  return undefined
}

/**
 * Gets information about className utility imports in a source file.
 * Returns an array of objects containing the identifier name and module specifier.
 */
export function getClassNameUtilityImports(sourceFile: SourceFile): { identifier: string; module: string }[] {
  const imports: { identifier: string; module: string }[] = []

  const importDeclarations = sourceFile.getImportDeclarations()

  for (const importDeclaration of importDeclarations) {
    const moduleSpecifier = importDeclaration.getModuleSpecifier().getLiteralText()

    if (CLASSNAME_UTILITY_MODULES.includes(moduleSpecifier as any)) {
      const defaultImport = importDeclaration.getDefaultImport()
      if (defaultImport) {
        imports.push({
          identifier: defaultImport.getText(),
          module: moduleSpecifier
        })
      }
    }
  }

  return imports
}

/**
 * Checks if a source file has any className utility imports.
 */
export function hasClassNameUtilityImport(sourceFile: SourceFile): boolean {
  return getClassNameUtilityImports(sourceFile).length > 0
}

/**
 * Gets the preferred className utility identifier to use in a source file.
 * If there are existing imports, returns the first one found.
 * Otherwise, returns the default 'classNames'.
 */
export function getPreferredClassNameUtilityIdentifier(sourceFile: SourceFile): string {
  const existingImports = getClassNameUtilityImports(sourceFile)
  if (existingImports.length > 0) {
    return existingImports[0].identifier
  }
  return CLASSNAMES_IDENTIFIER
}
