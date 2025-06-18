import { printNode, SyntaxKind } from 'ts-morph'
import { factory } from 'typescript'

import { createSourceFile } from '@sourcegraph/codemod-toolkit-ts'

import {
  CLASSNAMES_IDENTIFIER,
  CLASSNAMES_MODULE_SPECIFIER,
  wrapIntoClassNamesUtility,
  addClassNamesUtilImportIfNeeded,
  isClassNamesCallExpression,
  isClassNamesCallExpressionByIdentifier,
  isClassNamesCallExpressionHybrid,
  isClassNameUtilityIdentifier,
  isImportedFromClassNameUtilityModule,
} from '../classNames'

describe('`classNames` helpers', () => {
  describe('wrapIntoClassNamesUtility', () => {
    it('wraps arguments into `classNames` function call', () => {
      const classNamesArguments = [factory.createStringLiteral('first'), factory.createStringLiteral('second')]
      const classNamesCall = wrapIntoClassNamesUtility(classNamesArguments)

      expect(printNode(classNamesCall)).toEqual(`${CLASSNAMES_IDENTIFIER}("first", "second")`)
    })
  })

  describe('addClassNamesUtilImportIfNeeded', () => {
    const classNamesImport = `import ${CLASSNAMES_IDENTIFIER} from '${CLASSNAMES_MODULE_SPECIFIER}'`

    it('adds `classNames` import if needed', () => {
      const { sourceFile } = createSourceFile('<div className={classNames("wow")} />')
      const hasClassNamesImport = () => {
        return sourceFile.getText().includes(classNamesImport)
      }

      expect(hasClassNamesImport()).toBe(false)
      addClassNamesUtilImportIfNeeded(sourceFile)
      expect(hasClassNamesImport()).toBe(true)
    })

    it("doesn't duplicate `classnames` import", () => {
      const { sourceFile } = createSourceFile('<div className={classNames("wow")} />')

      addClassNamesUtilImportIfNeeded(sourceFile)
      addClassNamesUtilImportIfNeeded(sourceFile)

      const classNamesMatches = sourceFile.getText().match(new RegExp(classNamesImport, 'g'))
      expect(classNamesMatches?.length).toEqual(1)
    })

    it("doesn't add `classnames` import if `classNames` util is not used", () => {
      const { sourceFile } = createSourceFile('<div className="wow" />')

      addClassNamesUtilImportIfNeeded(sourceFile)

      expect(sourceFile.getText().includes(CLASSNAMES_MODULE_SPECIFIER)).toBe(false)
    })
  })
})

describe('Enhanced className utility detection', () => {
  describe('isClassNameUtilityIdentifier', () => {
    it('detects common className utility identifiers', () => {
      expect(isClassNameUtilityIdentifier('cn')).toBe(true)
      expect(isClassNameUtilityIdentifier('classNames')).toBe(true)
      expect(isClassNameUtilityIdentifier('clsx')).toBe(true)
      expect(isClassNameUtilityIdentifier('CN')).toBe(true) // case insensitive
      expect(isClassNameUtilityIdentifier('CLSX')).toBe(true)
    })

    it('rejects non-className utility identifiers', () => {
      expect(isClassNameUtilityIdentifier('someFunction')).toBe(false)
      expect(isClassNameUtilityIdentifier('className')).toBe(false)
      expect(isClassNameUtilityIdentifier('cls')).toBe(false)
      expect(isClassNameUtilityIdentifier('')).toBe(false)
    })
  })

  describe('isImportedFromClassNameUtilityModule', () => {
    it('detects imports from classnames module', () => {
      const { sourceFile } = createSourceFile(`
                import classNames from 'classnames'
                const result = classNames("test")
            `)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isImportedFromClassNameUtilityModule(callExpression.getExpression())).toBe(true)
    })

    it('detects imports from clsx module', () => {
      const { sourceFile } = createSourceFile(`
                import clsx from 'clsx'
                const result = clsx("test")
            `)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isImportedFromClassNameUtilityModule(callExpression.getExpression())).toBe(true)
    })

    it('detects aliased imports', () => {
      const { sourceFile } = createSourceFile(`
                import cn from 'classnames'
                const result = cn("test")
            `)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isImportedFromClassNameUtilityModule(callExpression.getExpression())).toBe(true)
    })

    it('rejects imports from other modules', () => {
      const { sourceFile } = createSourceFile(`
                import someFunction from 'other-module'
                const result = someFunction("test")
            `)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isImportedFromClassNameUtilityModule(callExpression.getExpression())).toBe(false)
    })
  })

  describe('isClassNamesCallExpressionByIdentifier', () => {
    it('detects className utility calls by identifier pattern', () => {
      const { sourceFile } = createSourceFile('const result = cn("test")')
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isClassNamesCallExpressionByIdentifier(callExpression)).toBe(true)
    })

    it('rejects non-className utility calls', () => {
      const { sourceFile } = createSourceFile('const result = someFunction("test")')
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isClassNamesCallExpressionByIdentifier(callExpression)).toBe(false)
    })
  })

  describe('isClassNamesCallExpressionHybrid', () => {
    it('detects calls with proper imports (primary method)', () => {
      const { sourceFile } = createSourceFile(`
                import cn from 'clsx'
                const result = cn("test")
            `)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isClassNamesCallExpressionHybrid(callExpression)).toBe(true)
    })

    it('falls back to identifier pattern when import detection fails', () => {
      const { sourceFile } = createSourceFile('const result = clsx("test")')
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isClassNamesCallExpressionHybrid(callExpression)).toBe(true)
    })

    it('rejects non-className utility calls', () => {
      const { sourceFile } = createSourceFile('const result = someFunction("test")')
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      expect(isClassNamesCallExpressionHybrid(callExpression)).toBe(false)
    })
  })

  describe('isClassNamesCallExpression (main function)', () => {
    const testCases = [
      // Standard classnames imports
      { code: 'import classNames from "classnames"; classNames("test")', expected: true, description: 'standard classNames import' },
      { code: 'import cn from "classnames"; cn("test")', expected: true, description: 'aliased classnames import' },

      // clsx imports
      { code: 'import clsx from "clsx"; clsx("test")', expected: true, description: 'standard clsx import' },
      { code: 'import cn from "clsx"; cn("test")', expected: true, description: 'aliased clsx import' },

      // Fallback to identifier patterns (when no import)
      { code: 'cn("test")', expected: true, description: 'cn identifier without import' },
      { code: 'clsx("test")', expected: true, description: 'clsx identifier without import' },
      { code: 'classNames("test")', expected: true, description: 'classNames identifier without import' },

      // Negative cases
      { code: 'import someFunc from "other-module"; someFunc("test")', expected: false, description: 'non-className utility import' },
      { code: 'someFunction("test")', expected: false, description: 'unrelated function call' },
    ]

    testCases.forEach(({ code, expected, description }) => {
      it(`${expected ? 'detects' : 'rejects'} ${description}`, () => {
        const { sourceFile } = createSourceFile(code)
        const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
        expect(isClassNamesCallExpression(callExpression)).toBe(expected)
      })
    })
  })
})
