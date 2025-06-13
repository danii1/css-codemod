import path from 'path'

import signale from 'signale'

import { Codemod } from '@sourcegraph/codemod-cli'
import { isDefined } from '@sourcegraph/codemod-common'
import { formatWithStylelint } from '@sourcegraph/codemod-toolkit-css'
import { addClassNamesUtilImportIfNeeded } from '@sourcegraph/codemod-toolkit-packages'
import { formatWithPrettierEslint, getImportDeclarationByModuleSpecifier } from '@sourcegraph/codemod-toolkit-ts'

import { getCssModuleExportNameMap } from './postcss/getCssModuleExportNameMap'
import { transformFileToCssModule } from './postcss/transformFileToCssModule'
import { generateReport } from './report/generateReport'
import { STYLES_IDENTIFIER } from './ts/processNodesWithClassName'
import { transformComponentFile } from './ts/transformComponentFile'

interface ClassUsage {
  className: string
  occurrences: number
  files: string[]
}

interface GlobalCssToCssModuleOptions {
  reportPath?: string
  [key: string]: unknown
}

/**
 * Convert globally scoped stylesheet tied to the React component into a CSS Module.
 *
 * 1) Find `.tsx` file.
 * 2) Check if corresponding `.css` file exists in the same folder.
 * 3) Convert this `.css` file into `.module.css`.
 * 4) Get info about CSS class names and matching export tokens.
 * 5) Replace all matching class names with export tokens.
 * 6) Add `classNames` import to the `.tsx` file if needed.
 * 7) Add `.module.css` import to the `.tsx` file.
 *
 */
export const globalCssToCssModule: Codemod<GlobalCssToCssModuleOptions> = context => {
  const { project, shouldWriteFiles, shouldFormat, transformOptions } = context
  const { reportPath } = transformOptions || {}
  const fs = project.getFileSystem()

  // Track classes that prevent conversion
  const classUsages = new Map<string, ClassUsage>()

  /**
   * Find `.tsx` files with co-located `.css` file.
   * For example `RepoHeader.tsx` should have matching `RepoHeader.css` in the same folder.
   */
  const itemsToProcess = project
    .getSourceFiles()
    .map(tsSourceFile => {
      const tsFilePath = tsSourceFile.getFilePath()

      const parsedTsFilePath = path.parse(tsFilePath)

      if (parsedTsFilePath.ext !== '.tsx') {
        return
      }

      const cssFilePath = path.resolve(parsedTsFilePath.dir, `${parsedTsFilePath.name}.css`)

      if (fs.fileExistsSync(cssFilePath)) {
        return {
          tsSourceFile,
          cssFilePath,
        }
      }

      return undefined
    })
    .filter(isDefined)

  if (itemsToProcess.length === 0) {
    signale.warn('No files to process!')

    return Promise.resolve([])
  }

  const codemodResultPromises = itemsToProcess.map(async ({ tsSourceFile, cssFilePath }) => {
    const tsFilePath = tsSourceFile.getFilePath()
    const parsedTsFilePath = path.parse(tsFilePath)

    signale.info(`Processing file "${tsFilePath}"`)

    const sourceCss = fs.readFileSync(cssFilePath, 'utf8')
    const exportNameMap = await getCssModuleExportNameMap(sourceCss)

    // Generate a potential CSS module filename for the transformComponentFile check
    const { dir, name } = path.parse(cssFilePath)
    const cssModuleFileName = path.join(dir, `${name}.module.css`)

    // Track classes that prevent conversion
    const sourceText = tsSourceFile.getFullText()
    const classNameRegex = /className=["']([^"']+)["']/g
    let match

    while ((match = classNameRegex.exec(sourceText)) !== null) {
      const classNames = match[1].split(/\s+/)
      for (const className of classNames) {
        if (!exportNameMap[className]) {
          const usage = classUsages.get(className) || {
            className,
            occurrences: 0,
            files: [],
          }
          usage.occurrences++
          if (!usage.files.includes(tsFilePath)) {
            usage.files.push(tsFilePath)
          }
          classUsages.set(className, usage)
        }
      }
    }

    const wasTransformed = transformComponentFile({ tsSourceFile, exportNameMap, cssModuleFileName })

    // Only create CSS module and process files if transformation was successful
    if (wasTransformed) {
      const { css: cssModuleSource, filePath: actualCssModuleFileName, typeDefinitions, typeDefinitionsPath } = await transformFileToCssModule({
        sourceCss,
        sourceFilePath: cssFilePath,
      })

      addClassNamesUtilImportIfNeeded(tsSourceFile)

      // Remove the original CSS import if it exists
      const originalCssImportPath = `./${path.parse(cssFilePath).base}`
      const existingCssImport = getImportDeclarationByModuleSpecifier(tsSourceFile, originalCssImportPath)
      if (existingCssImport) {
        existingCssImport.remove()
      }

      tsSourceFile.addImportDeclaration({
        defaultImport: STYLES_IDENTIFIER,
        moduleSpecifier: `./${path.parse(actualCssModuleFileName).base}`,
      })

      if (shouldFormat) {
        formatWithPrettierEslint(tsSourceFile)
      }

      const formattedCssModuleSource = await formatWithStylelint(cssModuleSource, cssFilePath)

      /**
       * If `shouldWriteFiles` is true:
       *
       * 1. Update TS file with a new source that uses CSS module.
       * 2. Create a new CSS module file.
       * 3. Create type definitions file.
       * 4. Delete redundant CSS file that's replaced with CSS module.
       */
      const fsWritePromise = shouldWriteFiles
        ? Promise.all([
          tsSourceFile.save(),
          fs.writeFile(actualCssModuleFileName, formattedCssModuleSource),
          fs.writeFile(typeDefinitionsPath, typeDefinitions),
          fs.delete(cssFilePath),
        ])
        : undefined

      return {
        target: tsSourceFile,
        manualChangesReported: {},
        fsWritePromise,
        files: [
          {
            source: formattedCssModuleSource,
            path: path.resolve(parsedTsFilePath.dir, actualCssModuleFileName),
          },
          {
            source: tsSourceFile.getFullText(),
            path: tsSourceFile.getFilePath(),
          },
          {
            source: typeDefinitions,
            path: path.resolve(parsedTsFilePath.dir, typeDefinitionsPath),
          },
        ],
      }
    }
    // Transformation was skipped, return only the original TypeScript file
    return {
      target: tsSourceFile,
      manualChangesReported: {},
      fsWritePromise: undefined,
      files: [
        {
          source: tsSourceFile.getFullText(),
          path: tsSourceFile.getFilePath(),
        },
      ],
    }
  })

  return Promise.all(codemodResultPromises).then(results => {
    // Generate report if path is provided
    if (reportPath && classUsages.size > 0) {
      generateReport([...classUsages.values()], reportPath)
      signale.info(`Generated report at ${reportPath}`)
    }

    return results
  })
}
