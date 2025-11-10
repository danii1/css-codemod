import fs from 'fs'
import path from 'path'

import signale from 'signale'
import type { FileSystemHost, Project, SourceFile } from 'ts-morph'

import { Codemod } from '@sourcegraph/codemod-cli'
import { isDefined } from '@sourcegraph/codemod-common'
import { formatWithStylelint } from '@sourcegraph/codemod-toolkit-css'
import { addClassNamesUtilImportIfNeeded, CLASSNAME_UTILITY_IDENTIFIERS } from '@sourcegraph/codemod-toolkit-packages'
import { formatWithPrettierEslint, getImportDeclarationByModuleSpecifier } from '@sourcegraph/codemod-toolkit-ts'

import { collectGitignorePatterns, isPathIgnored } from './gitignore-utils'
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

interface SkippedFile {
  filePath: string
  reason: string
  conflictingClasses: string[]
  conflictingFiles: string[]
  unusedClasses?: string[]
}

interface GlobalCssToCssModuleOptions {
  reportPath?: string
  globalCssFiles?: string[]
  projectDir?: string
  [key: string]: unknown
}

/**
 * Extract CSS class names from a CSS file content.
 * This function parses CSS and extracts all class selectors.
 * Excludes @keyframes names and class-like patterns in property values.
 */
function extractCssClassNames(cssContent: string): Set<string> {
  const classNames = new Set<string>()

  // Remove @keyframes blocks to avoid matching animation names
  // This handles nested braces correctly by counting brace depth
  let cssWithoutKeyframes = cssContent
  const keyframesRegex = /@keyframes\s+[\w-]+\s*{/g
  let keyframeMatch: RegExpExecArray | null = null

  keyframeMatch = keyframesRegex.exec(cssWithoutKeyframes)
  while (keyframeMatch !== null) {
    const startIndex = keyframeMatch.index
    let braceCount = 1
    let currentIndex = keyframeMatch.index + keyframeMatch[0].length

    // Find the matching closing brace
    while (braceCount > 0 && currentIndex < cssWithoutKeyframes.length) {
      if (cssWithoutKeyframes[currentIndex] === '{') {
        braceCount++
      } else if (cssWithoutKeyframes[currentIndex] === '}') {
        braceCount--
      }
      currentIndex++
    }

    // Remove the entire @keyframes block
    cssWithoutKeyframes = cssWithoutKeyframes.slice(0, startIndex) + cssWithoutKeyframes.slice(currentIndex)

    // Reset regex
    keyframesRegex.lastIndex = 0
    keyframeMatch = keyframesRegex.exec(cssWithoutKeyframes)
  }

  // Match CSS class selectors at the beginning of selectors or after whitespace/comma
  // This regex matches .className but not :global(.className) and avoids matching numbers in values
  const classRegex = /(?<!:global\()(?:^|[\s+,>~])\.([\w-]+)(?=[\s#+,.:>[{~]|$)/gm
  let classMatch: RegExpExecArray | null = null

  classMatch = classRegex.exec(cssWithoutKeyframes)
  while (classMatch !== null) {
    const className = classMatch[1]
    if (className) {
      classNames.add(className)
    }
    classMatch = classRegex.exec(cssWithoutKeyframes)
  }

  return classNames
}

/**
 * Load and extract class names from global CSS files.
 */
function loadGlobalCssClassNames(globalCssFiles: string[], fileSystem: FileSystemHost): Set<string> {
  const globalClassNames = new Set<string>()

  for (const globalCssFile of globalCssFiles) {
    try {
      if (fileSystem.fileExistsSync(globalCssFile)) {
        const cssContent = fileSystem.readFileSync(globalCssFile, 'utf8')
        const classNames = extractCssClassNames(cssContent)

        for (const className of classNames) {
          globalClassNames.add(className)
        }

        signale.info(`Loaded ${classNames.size} global CSS classes from ${globalCssFile}`)
      } else {
        signale.warn(`Global CSS file not found: ${globalCssFile}`)
      }
    } catch (error) {
      signale.error(`Error reading global CSS file ${globalCssFile}:`, error)
    }
  }

  return globalClassNames
}

/**
 * Extract node_modules CSS imports from source files.
 * These will be treated as global CSS since they're external dependencies.
 * Excludes imports that match tsconfig path aliases (e.g., 'components/*', 'pages/*').
 */
function extractNodeModulesCssImports(
  sourceFiles: SourceFile[],
  project: Project,
  fileSystem: FileSystemHost,
  projectDirectory: string | undefined
): string[] {
  const nodeModulesCssFiles: string[] = []
  const nodeModulesDirectory = projectDirectory ? path.join(projectDirectory, 'node_modules') : undefined

  if (!nodeModulesDirectory) {
    return nodeModulesCssFiles
  }

  // Get path aliases from tsconfig to exclude them
  const compilerOptions = project.getCompilerOptions()
  const paths = compilerOptions.paths || {}
  const baseUrl = compilerOptions.baseUrl
  const aliasPatterns = Object.keys(paths).map(alias => {
    return new RegExp(`^${alias.replace(/\*/g, '.*')}$`)
  })

  for (const sourceFile of sourceFiles) {
    const importDeclarations = sourceFile.getImportDeclarations()

    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue()

      // Check if it's a CSS import (doesn't start with ./ or ../)
      if (
        moduleSpecifier.endsWith('.css') &&
        !moduleSpecifier.endsWith('.module.css') &&
        !moduleSpecifier.startsWith('./') &&
        !moduleSpecifier.startsWith('../')
      ) {
        // Check if it matches any tsconfig path alias
        const matchesAlias = aliasPatterns.some(pattern => pattern.test(moduleSpecifier))

        // Also check if it resolves via baseUrl (e.g., 'styles/base.css')
        let resolvesViaBaseUrl = false
        if (baseUrl && !matchesAlias) {
          const baseUrlPath = path.resolve(path.dirname(sourceFile.getFilePath()), baseUrl, moduleSpecifier)
          // Check if it exists outside node_modules
          resolvesViaBaseUrl = !baseUrlPath.includes('/node_modules/') && fileSystem.fileExistsSync(baseUrlPath)
        }

        // Only add to node_modules list if it doesn't match a path alias or baseUrl
        if (!matchesAlias && !resolvesViaBaseUrl) {
          const fullPath = path.join(nodeModulesDirectory, moduleSpecifier)
          if (!nodeModulesCssFiles.includes(fullPath)) {
            nodeModulesCssFiles.push(fullPath)
          }
        }
      }
    }
  }

  return nodeModulesCssFiles
}

/**
 * Search for class name usage across the entire project directory.
 * This function scans all CSS and TSX files in the project directory to find class name conflicts.
 * Respects .gitignore files at all levels in the project.
 */
function findClassNameUsageInProject(
  classNames: string[],
  projectDirectory: string,
  excludeFiles: string[] = []
): Map<string, string[]> {
  const classUsageMap = new Map<string, string[]>()

  // Initialize map with empty arrays for all class names
  for (const className of classNames) {
    classUsageMap.set(className, [])
  }

  try {
    // Collect all gitignore patterns from the project
    const gitignoreMap = collectGitignorePatterns(projectDirectory)

    // Function to recursively scan directory
    function scanDirectory(directoryPath: string): void {
      // Check if this directory should be ignored
      if (isPathIgnored(directoryPath, gitignoreMap)) {
        return
      }

      const entries = fs.readdirSync(directoryPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name)

        // Check if this path should be ignored by gitignore
        if (isPathIgnored(fullPath, gitignoreMap)) {
          continue
        }

        // Skip node_modules and other common directories (backup check)
        if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
          scanDirectory(fullPath)
        } else if (entry.isFile() && /\.(tsx|css)$/i.test(entry.name)) {
          // Skip files that are being processed (to avoid self-references)
          if (excludeFiles.includes(fullPath)) {
            continue
          }

          try {
            const content = fs.readFileSync(fullPath, 'utf8')

            // Check each class name for usage in this file
            for (const className of classNames) {
              // Create regex patterns to match class usage
              const patterns = [
                // CSS selector: .className (must be followed by CSS delimiter or end of line)
                new RegExp(`\\.${escapeRegExp(className)}(?=[\\s#+,.:>[{~]|$)`, 'g'),
                // TSX className: className="...className..." or className='...className...'
                // Match className as standalone or separated by whitespace, not as substring
                new RegExp(`className=["'](?:[^"']*\\s)?${escapeRegExp(className)}(?:\\s[^"']*)?["']`, 'g'),
                // Template literal: className={\`...className...\`}
                // Match className as standalone or separated by whitespace, not as substring
                new RegExp(`className=\\{[\`](?:[^\`]*\\s)?${escapeRegExp(className)}(?:\\s[^\`]*)?[\`]\\}`, 'g'),
                // Class name utilities: any identifier matching className utility patterns - exact string match
                createClassNameUtilityPattern(className),
              ]

              const hasMatch = patterns.some(pattern => { return pattern.test(content) })
              if (hasMatch) {
                const existingFiles = classUsageMap.get(className) || []
                if (!existingFiles.includes(fullPath)) {
                  existingFiles.push(fullPath)
                  classUsageMap.set(className, existingFiles)
                }
              }
            }
          } catch (error) {
            // Skip files that can't be read
            signale.debug(`Could not read file ${fullPath}: ${String(error)}`)
          }
        }
      }
    }

    scanDirectory(projectDirectory)
  } catch (error) {
    signale.warn(`Error scanning project directory ${projectDirectory}: ${String(error)}`)
  }

  return classUsageMap
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
}

/**
 * Generate a regex pattern that matches className utility calls with any identifier
 * that follows common naming patterns (cn, classNames, clsx, etc.)
 */
function createClassNameUtilityPattern(className: string): RegExp {
  const escapedClassName = escapeRegExp(className)
  // Use the same identifier pattern from our enhanced detection
  const identifierPattern = CLASSNAME_UTILITY_IDENTIFIERS.source.slice(1, -1) // Remove ^ and $ anchors
  return new RegExp(`(?:${identifierPattern})\\([^)]*["'\`]${escapedClassName}["'\`][^)]*\\)`, 'gi')
}

/**
 * Resolve path aliases from tsconfig paths configuration.
 * Manually resolves CSS files since TypeScript's resolveModuleName only handles TS/JS files.
 */
function resolveAliasedPath(
  moduleSpecifier: string,
  tsSourceFile: SourceFile,
  project: Project,
  fileSystem: FileSystemHost
): string | undefined {
  const compilerOptions = project.getCompilerOptions()
  const paths = compilerOptions.paths
  const baseUrl = compilerOptions.baseUrl

  if (!baseUrl) {
    return undefined
  }

  // First, try to match against path aliases if configured
  if (paths) {
    for (const [alias, mappings] of Object.entries(paths)) {
      // Convert alias pattern to regex (e.g., "components/*" -> "^components/(.*)$")
      const aliasPattern = alias.replace(/\*/g, '(.*)')
      const regex = new RegExp(`^${aliasPattern}$`)
      const match = moduleSpecifier.match(regex)

      if (match) {
        // Try each mapping for this alias
        for (const mapping of mappings) {
          // Replace wildcards in mapping with captured groups
          let resolvedPath = mapping
          for (let groupIndex = 1; groupIndex < match.length; groupIndex++) {
            resolvedPath = resolvedPath.replace('*', match[groupIndex])
          }

          // Resolve relative to baseUrl
          const fullPath = path.resolve(path.dirname(tsSourceFile.getFilePath()), baseUrl, resolvedPath)

          if (fileSystem.fileExistsSync(fullPath)) {
            return fullPath
          }
        }
      }
    }
  }

  // If no alias matched, try resolving relative to baseUrl directly
  // This handles imports like 'styles/base.css' when baseUrl is set but no path alias exists
  const baseUrlPath = path.resolve(path.dirname(tsSourceFile.getFilePath()), baseUrl, moduleSpecifier)
  if (fileSystem.fileExistsSync(baseUrlPath)) {
    return baseUrlPath
  }

  // Debug logging for failed resolutions
  if (process.env.DEBUG_CSS_TRANSFORM) {
    signale.debug(`Failed to resolve aliased path: "${moduleSpecifier}" from ${tsSourceFile.getFilePath()}`)
  }

  return undefined
}

/**
 * Check if a module specifier might be a node_modules import (not a path alias or baseUrl import)
 */
function isLikelyNodeModulesImport(
  moduleSpecifier: string,
  tsSourceFile: SourceFile,
  project: Project,
  fileSystem: FileSystemHost
): boolean {
  // Get path aliases from tsconfig
  const compilerOptions = project.getCompilerOptions()
  const paths = compilerOptions.paths || {}
  const baseUrl = compilerOptions.baseUrl

  // Create regex patterns from path aliases
  const aliasPatterns = Object.keys(paths).map(alias => {
    return new RegExp(`^${alias.replace(/\*/g, '.*')}$`)
  })

  // Check if it matches any path alias
  const matchesAlias = aliasPatterns.some(pattern => {
    return pattern.test(moduleSpecifier)
  })
  if (matchesAlias) {
    return false // It's a path alias, not node_modules
  }

  // Check if it resolves via baseUrl
  if (baseUrl) {
    const baseUrlPath = path.resolve(path.dirname(tsSourceFile.getFilePath()), baseUrl, moduleSpecifier)
    if (!baseUrlPath.includes('/node_modules/') && fileSystem.fileExistsSync(baseUrlPath)) {
      return false // It's a baseUrl import, not node_modules
    }
  }

  return true // Likely a node_modules import
}

/**
 * Find CSS import in a TypeScript source file.
 * Returns the path to the CSS file if found, undefined otherwise.
 * Skips CSS module imports (.module.css) as those are already transformed.
 * Skips node_modules CSS imports as those are handled separately.
 * Supports both relative imports (./file.css) and absolute/aliased imports (components/file.css).
 */
function findCssImportPath(tsSourceFile: SourceFile, project: Project, fileSystem: FileSystemHost): string | undefined {
  const tsFileDirectory = path.dirname(tsSourceFile.getFilePath())

  // Get all import declarations
  const importDeclarations = tsSourceFile.getImportDeclarations()

  for (const importDecl of importDeclarations) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()

    // Skip CSS module imports (.module.css) as those are already transformed
    if (!moduleSpecifier.endsWith('.css') || moduleSpecifier.endsWith('.module.css')) {
      continue
    }

    let cssFilePath: string | undefined

    // Handle relative imports
    if (moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
      cssFilePath = path.resolve(tsFileDirectory, moduleSpecifier)
    } else {
      // Skip node_modules imports (they're handled separately as global CSS)
      if (isLikelyNodeModulesImport(moduleSpecifier, tsSourceFile, project, fileSystem)) {
        continue
      }

      // Handle absolute/aliased imports (e.g., 'components/sidebar/index.css')
      // Use TypeScript's module resolution with tsconfig paths
      cssFilePath = resolveAliasedPath(moduleSpecifier, tsSourceFile, project, fileSystem)
    }

    // Verify the file exists and return it
    if (cssFilePath && fileSystem.fileExistsSync(cssFilePath)) {
      return cssFilePath
    }
  }

  return undefined
}

/**
 * Convert globally scoped stylesheet tied to the React component into a CSS Module.
 *
 * 1) Find `.tsx` file.
 * 2) Check if the file imports a `.css` file (supports any naming convention: styles.css, index.css, etc.)
 * 3) Convert this `.css` file into `.module.css`.
 * 4) Get info about CSS class names and matching export tokens.
 * 5) Replace all matching class names with export tokens.
 * 6) Add `classNames` import to the `.tsx` file if needed.
 * 7) Update the CSS import to point to the new `.module.css` file.
 *
 * Options:
 * - `reportPath`: Path to generate a report of classes that prevent conversion
 * - `globalCssFiles`: Array of paths to global CSS files containing classes that shouldn't prevent conversion
 *
 * Example usage with global CSS files:
 * ```ts
 * await globalCssToCssModule({
 *   project,
 *   transformOptions: {
 *     globalCssFiles: ['src/styles/bootstrap.css', 'src/styles/global.css']
 *   }
 * })
 * ```
 */
export const globalCssToCssModule: Codemod<GlobalCssToCssModuleOptions> = context => {
  const { project, shouldWriteFiles, shouldFormat, transformOptions } = context
  const { reportPath, globalCssFiles = [], projectDir } = transformOptions || {}
  const fs = project.getFileSystem()

  // Extract node_modules CSS imports and add them to global CSS files
  const nodeModulesCssFiles = extractNodeModulesCssImports(project.getSourceFiles(), project, fs, projectDir)
  const allGlobalCssFiles = [...globalCssFiles, ...nodeModulesCssFiles]

  // Load global CSS class names that shouldn't prevent conversion
  const globalClassNames = loadGlobalCssClassNames(allGlobalCssFiles, fs)

  if (nodeModulesCssFiles.length > 0) {
    signale.info(`Auto-detected ${nodeModulesCssFiles.length} CSS files from node_modules as global CSS`)
  }

  // Track classes that prevent conversion
  const classUsages = new Map<string, ClassUsage>()

  // Track files that were skipped due to class name conflicts
  const skippedFiles: SkippedFile[] = []

  /**
   * Find `.tsx` files that either:
   * 1. Import a `.css` file (supports any naming convention: styles.css, index.css, etc.)
   * 2. Have a co-located `.css` file with the same name (legacy behavior)
   */
  const itemsToProcess = project
    .getSourceFiles()
    .map(tsSourceFile => {
      const tsFilePath = tsSourceFile.getFilePath()

      const parsedTsFilePath = path.parse(tsFilePath)

      if (parsedTsFilePath.ext !== '.tsx') {
        return
      }

      // First, try to find CSS import in the file
      let cssFilePath = findCssImportPath(tsSourceFile, project, fs)

      // If no import found, fall back to co-located CSS file with matching name
      if (!cssFilePath) {
        const colocatedCssPath = path.resolve(parsedTsFilePath.dir, `${parsedTsFilePath.name}.css`)
        if (fs.fileExistsSync(colocatedCssPath)) {
          cssFilePath = colocatedCssPath
        }
      }

      if (cssFilePath) {
        return {
          tsSourceFile,
          cssFilePath,
        }
      }

      return undefined
    })
    .filter(isDefined)

  // Log discovered CSS files for debugging
  signale.info(`Found ${itemsToProcess.length} TSX files with CSS files`)

  if (itemsToProcess.length === 0) {
    signale.warn('No files to process!')

    return Promise.resolve([])
  }

  // Write list of discovered files to a debug file if in debug mode
  if (process.env.DEBUG_CSS_TRANSFORM) {
    const discoveredFiles = itemsToProcess.map(({ tsSourceFile, cssFilePath }) => {
      return {
        tsx: tsSourceFile.getFilePath(),
        css: cssFilePath,
      }
    })
    const debugOutput = JSON.stringify(discoveredFiles, null, 2)
    const debugPath = process.env.DEBUG_CSS_TRANSFORM
    fs.writeFileSync(debugPath, debugOutput)
    signale.info(`Debug: Wrote discovered files to ${debugPath}`)
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

    // If projectDir is specified, check for class name conflicts across the entire project
    let hasConflicts = false
    const conflictingClasses: string[] = []
    let conflictingFiles: string[] = []

    if (projectDir) {
      const cssClassNames = Object.keys(exportNameMap)
      const projectUsageMap = findClassNameUsageInProject(
        cssClassNames,
        projectDir,
        [tsFilePath, cssFilePath] // Exclude current files from conflict check
      )

      // Check for conflicts
      for (const [className, usageFiles] of projectUsageMap.entries()) {
        if (usageFiles.length > 0 && !globalClassNames.has(className)) {
          hasConflicts = true
          conflictingClasses.push(className)
          conflictingFiles.push(...usageFiles)
        }
      }

      // Remove duplicates from conflicting files
      conflictingFiles = [...new Set(conflictingFiles)]
    }

    // Track classes that prevent conversion (excluding global classes)
    const sourceText = tsSourceFile.getFullText()
    const classNameRegex = /className=["']([^"']+)["']/g
    let match

    while ((match = classNameRegex.exec(sourceText)) !== null) {
      const classNames = match[1].split(/\s+/)
      for (const className of classNames) {
        if (!exportNameMap[className] && !globalClassNames.has(className)) {
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

    // Skip transformation if there are project-wide conflicts
    if (hasConflicts) {
      signale.warn(
        `Skipping transformation of ${tsFilePath} - class names are used elsewhere in the project.`,
        `\nConflicting classes: ${conflictingClasses.join(', ')}`,
        `\nConflicting files: ${conflictingFiles.slice(0, 5).join(', ')}${conflictingFiles.length > 5 ? ` and ${conflictingFiles.length - 5} more...` : ''}`
      )

      skippedFiles.push({
        filePath: tsFilePath,
        reason: 'Class names used elsewhere in project',
        conflictingClasses,
        conflictingFiles,
      })

      // Return the original file unchanged
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
    }

    const transformResult = transformComponentFile({ tsSourceFile, exportNameMap, cssModuleFileName, globalClassNames })

    // Only create CSS module and process files if transformation was successful
    if (transformResult.success) {
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
    // Transformation was skipped, track the skip reason
    if (!transformResult.success) {
      skippedFiles.push({
        filePath: tsFilePath,
        reason: transformResult.reason || 'Unknown reason',
        conflictingClasses: [],
        conflictingFiles: [],
        unusedClasses: transformResult.unusedClasses,
      })
    }

    // Return only the original TypeScript file
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
    if (reportPath && (classUsages.size > 0 || skippedFiles.length > 0)) {
      generateReport([...classUsages.values()], reportPath, skippedFiles)
      signale.info(`Generated report at ${reportPath}`)
    }

    // Log summary
    const processedCount = results.length
    const skippedCount = skippedFiles.length
    const transformedCount = processedCount - skippedCount

    signale.success('Transformation complete:')
    signale.info(`  - ${transformedCount} files transformed`)
    signale.info(`  - ${skippedCount} files skipped due to conflicts`)
    signale.info(`  - ${processedCount} total files processed`)

    return results
  })
}
