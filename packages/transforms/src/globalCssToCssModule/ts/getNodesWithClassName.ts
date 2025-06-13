import { StringLiteral, Identifier, TemplateExpression, NoSubstitutionTemplateLiteral, SyntaxKind, SourceFile, Node } from 'ts-morph'

export function getNodesWithClassName(sourceFile: SourceFile): (Identifier | StringLiteral | TemplateExpression | NoSubstitutionTemplateLiteral)[] {
  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  const classNameJsxAttributes = jsxAttributes.filter(identifier => {
    return /classnames?$/i.test(identifier.getName())
  })

  // <div className={classNames({ kek: isActive })} /> — 'kek' is an `Identifier` inside of the `PropertyAssignment`.
  const classNameIdentifiers = classNameJsxAttributes
    .flatMap(classNameJsxAttribute => {
      return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.Identifier)
    })
    .filter(identifier => {
      return identifier.getParent().compilerNode.kind === SyntaxKind.PropertyAssignment
    })

  // <div className='kek' /> — 'kek' is a `StringLiteral` inside  of the `JsxAttribute`.
  const stringLiterals = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.StringLiteral)
  })

  // <div className={`kek kek--${variant}`} /> — template expressions in className attributes
  const templateExpressions = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.TemplateExpression)
  })

  // <div className={`kek kek`} /> — template literals without substitutions in className attributes
  const noSubstitutionTemplateLiterals = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  })

  // Find class names in cn() and classNames() function calls that are NOT inside className JSX attributes
  // const heightClassName = cn('Form_Input', { 'SizePicker__input--error': value.height < minHeight })
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
  const classNameUtilityCallExpressions = callExpressions.filter(callExpression => {
    const expression = callExpression.getExpression()
    if (expression.getKind() === SyntaxKind.Identifier) {
      const identifierName = expression.getText()
      // Match common className utility function names: cn, classNames, clsx, etc.
      const isClassNameUtility = /^(cn|classnames|clsx)$/i.test(identifierName)

      if (!isClassNameUtility) {
        return false
      }

      // Check if this call expression is inside a className JSX attribute
      // If it is, we don't want to include it here since it's already handled above
      let parent = callExpression.getParent()
      while (parent) {
        if (Node.isJsxAttribute(parent) && /classnames?$/i.test(parent.getName())) {
          return false // Skip this call expression as it's already handled by JSX attribute logic
        }
        parent = parent.getParent()
      }

      return true
    }
    return false
  })

  // Extract string literals and identifiers from className utility calls
  const utilityCallStringLiterals = classNameUtilityCallExpressions.flatMap(callExpression => {
    return callExpression.getDescendantsOfKind(SyntaxKind.StringLiteral)
  })

  const utilityCallIdentifiers = classNameUtilityCallExpressions
    .flatMap(callExpression => {
      return callExpression.getDescendantsOfKind(SyntaxKind.Identifier)
    })
    .filter(identifier => {
      const parent = identifier.getParent()
      // Only include identifiers that are property names in PropertyAssignment, not values
      if (parent.compilerNode.kind === SyntaxKind.PropertyAssignment) {
        // Check if this identifier is the property name (left side) not the value (right side)
        const propertyAssignment = parent as any
        return propertyAssignment.getName() === identifier.getText()
      }
      return false
    })

  const utilityCallTemplateExpressions = classNameUtilityCallExpressions.flatMap(callExpression => {
    return callExpression.getDescendantsOfKind(SyntaxKind.TemplateExpression)
  })

  const utilityCallNoSubstitutionTemplateLiterals = classNameUtilityCallExpressions.flatMap(callExpression => {
    return callExpression.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  })

  // Combine all results and deduplicate by node position
  const allNodes = [
    ...classNameIdentifiers,
    ...stringLiterals,
    ...templateExpressions,
    ...noSubstitutionTemplateLiterals,
    ...utilityCallStringLiterals,
    ...utilityCallIdentifiers,
    ...utilityCallTemplateExpressions,
    ...utilityCallNoSubstitutionTemplateLiterals
  ]

  // Deduplicate by node start position
  const uniqueNodes = allNodes.filter((node, index, array) => {
    const nodeStart = node.getStart()
    return array.findIndex(otherNode => { return otherNode.getStart() === nodeStart }) === index
  })

  return uniqueNodes
}
