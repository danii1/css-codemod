import { StringLiteral, Identifier, TemplateExpression, NoSubstitutionTemplateLiteral, SyntaxKind, SourceFile } from 'ts-morph'

export function getNodesWithClassName(sourceFile: SourceFile): (Identifier | StringLiteral | TemplateExpression | NoSubstitutionTemplateLiteral)[] {
  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  const classNameJsxAttributes = jsxAttributes.filter(identifier => {
    return identifier.getName() === 'className'
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
  const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral)

  // <div className={`kek kek--${variant}`} /> — template expressions in className attributes
  const templateExpressions = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.TemplateExpression)
  })

  // <div className={`kek kek`} /> — template literals without substitutions in className attributes
  const noSubstitutionTemplateLiterals = classNameJsxAttributes.flatMap(classNameJsxAttribute => {
    return classNameJsxAttribute.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  })

  return [...classNameIdentifiers, ...stringLiterals, ...templateExpressions, ...noSubstitutionTemplateLiterals]
}
