import { SyntaxKind } from 'ts-morph'

import { createSourceFile } from '@sourcegraph/codemod-toolkit-ts'

import { getNodesWithClassName } from '../getNodesWithClassName'

describe('getNodesWithClassName', () => {
  const testCases = [
    {
      fileSource: '<div className="kek" />',
      targetKind: 'StringLiteral',
      resultLength: 1,
      firstNode: {
        kind: SyntaxKind.StringLiteral,
        parentKind: SyntaxKind.JsxAttribute,
      },
    },
    {
      fileSource: '<div className={{ kek: isActive }} />',
      targetKind: 'Identifier',
      resultLength: 2,
      firstNode: {
        kind: SyntaxKind.Identifier,
        parentKind: SyntaxKind.PropertyAssignment,
      },
    },
    {
      fileSource: `
                <div className="kek">
                    <div className={classNames('pek', true ? 'flex' : 'mr-1', { kek: isActive })} />
                </div>
            `,
      targetKind: 'mixed',
      resultLength: 6,
      firstNode: {
        kind: SyntaxKind.Identifier,
        parentKind: SyntaxKind.PropertyAssignment,
      },
    },
    {
      fileSource: '<div itemClassName="kek" />',
      targetKind: 'StringLiteral',
      resultLength: 1,
      firstNode: {
        kind: SyntaxKind.StringLiteral,
        parentKind: SyntaxKind.JsxAttribute,
      },
    },
    {
      fileSource: '<div containerClassNames="kek pek" />',
      targetKind: 'StringLiteral',
      resultLength: 1,
      firstNode: {
        kind: SyntaxKind.StringLiteral,
        parentKind: SyntaxKind.JsxAttribute,
      },
    },
    {
      fileSource: '<div CLASSNAME="kek" />',
      targetKind: 'StringLiteral',
      resultLength: 1,
      firstNode: {
        kind: SyntaxKind.StringLiteral,
        parentKind: SyntaxKind.JsxAttribute,
      },
    },
    {
      fileSource: '<div rootClassNames={classNames("kek", { active: isActive })} />',
      targetKind: 'Identifier',
      resultLength: 3,
      firstNode: {
        kind: SyntaxKind.Identifier,
        parentKind: SyntaxKind.PropertyAssignment,
      },
    },
    {
      fileSource: '<div notClass="kek" />',
      targetKind: 'none',
      resultLength: 0,
      firstNode: null,
    },
  ]

  it.each(testCases)('finds nodes with class name of $targetKind kind', ({ fileSource, resultLength, firstNode }) => {
    const nodesWithClassName = getNodesWithClassName(createSourceFile(fileSource).sourceFile)

    expect(nodesWithClassName.length).toEqual(resultLength)

    if (firstNode) {
      expect(nodesWithClassName[0].getKind()).toBe(firstNode.kind)
      expect(nodesWithClassName[0].getParent().getKind()).toBe(firstNode.parentKind)
    }
  })
})
