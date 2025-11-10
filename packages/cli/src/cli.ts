// Used for parsing a transform module.
import 'ts-node/register/transpile-only'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { Command } from 'commander'
import signale from 'signale'
import { dedent } from 'ts-dedent'
// TODO: replace project with generic interface that can be used for CSS codemods.
import { Project } from 'ts-morph'

import { logRequiredManualChanges } from '@sourcegraph/codemod-common'

import { Codemod, CodemodContext, TransformOptions } from './types'

const program = new Command()

interface CodemodCliOptions extends TransformOptions {
  write: boolean
  format: boolean
  transform: string
  reportPath?: string
  globalCssFiles?: string[]
  projectDir?: string
}

const PROJECT_ROOT = path.resolve(__dirname, '../../../')

program
  // TODO: make it `true` by default after switching to fast bulk format.
  .option('-f, --format [format]', 'Format Typescript source files with ESLint', false)
  .option('-w, --write [write]', 'Persist codemod changes to the filesystem', false)
  .option('-t, --transform <transform>', 'Absolute or relative to project root path to a transform module')
  .option('-r, --report-path <path>', 'Path where to save the HTML report of classes preventing conversion')
  .option('-p, --project-dir <path>', 'Path to the project directory containing tsx/css files to be transformed (used for conflict detection scope)')
  .option('-g, --global-css-files <file>', 'Path to global CSS file containing classes that should not prevent conversion (can be used multiple times)', (value: string, previous: string[] = []) => {
    return [...previous, value]
  })
  .argument('<fileGlob>', 'Absolute or relative to project root file glob to change files based on')
  .allowUnknownOption(true)
  .enablePositionalOptions(true)
  .addHelpText(
    'after',
    dedent`

        Transform-specific options can be passed via using '--option=value' syntax:
        yarn transform --write --tagToConvert=Link -t ./transformPath.ts 'globPath/**/*.{ts,tsx}'

        Example with global CSS files (for globalCssToCssModule transform):
        yarn transform --write --global-css-files src/styles/bootstrap.css --global-css-files src/styles/global.css -t ./transforms/globalCssToCssModule.ts 'src/**/*.tsx'

        Example with project directory (for globalCssToCssModule transform):
        yarn transform --write --project-dir /path/to/project --global-css-files src/styles/bootstrap.css -t ./transforms/globalCssToCssModule.ts 'src/**/*.tsx'
    `
  )
  .action(async (commandArgument: string, options: CodemodCliOptions) => {
    const { fileGlob, transformOptions } = parseOptions(commandArgument)
    const { write: shouldWriteFiles, format: shouldFormat, transform, reportPath, globalCssFiles, projectDir } = options

    // Handle tilde expansion
    const expandedFileGlob = fileGlob.startsWith('~')
      ? path.join(os.homedir(), fileGlob.slice(1))
      : fileGlob

    const projectGlob = path.isAbsolute(expandedFileGlob) ? expandedFileGlob : path.join(PROJECT_ROOT, expandedFileGlob)

    // Handle project directory and transform path
    let transformPath: string
    let actualProjectDirectory: string

    if (projectDir) {
      // Handle tilde expansion for project directory
      const expandedProjectDirectory = projectDir.startsWith('~')
        ? path.join(os.homedir(), projectDir.slice(1))
        : projectDir

      // If project directory is specified, resolve it but keep transform path relative to PROJECT_ROOT
      actualProjectDirectory = path.isAbsolute(expandedProjectDirectory) ? expandedProjectDirectory : path.join(PROJECT_ROOT, expandedProjectDirectory)
      transformPath = path.isAbsolute(transform) ? transform : path.join(PROJECT_ROOT, transform)
    } else {
      // Use existing behavior
      actualProjectDirectory = PROJECT_ROOT
      transformPath = path.isAbsolute(transform) ? transform : path.join(PROJECT_ROOT, transform)
    }

    signale.start(`Starting codemod "${transformPath}" with the project glob "${projectGlob}".`)

    if (projectDir) {
      signale.info(`Using project directory: "${actualProjectDirectory}"`)
    }

    // Find the nearest tsconfig.json by walking up from the glob path
    // This supports monorepos where tsconfig.json might be in a package directory
    function findNearestTsConfig(startPath: string): string | undefined {
      let currentDirectory = path.dirname(startPath)
      const root = path.parse(currentDirectory).root

      while (currentDirectory !== root) {
        const tsConfigPath = path.join(currentDirectory, 'tsconfig.json')
        if (fs.existsSync(tsConfigPath)) {
          return tsConfigPath
        }
        currentDirectory = path.dirname(currentDirectory)
      }

      return undefined
    }

    // Find tsconfig from the glob path (where the files are) or from projectDir
    let tsConfigPath: string | undefined
    if (projectDir) {
      // First try to find tsconfig near the files being transformed
      tsConfigPath = findNearestTsConfig(projectGlob)

      // If not found, try from the project directory
      if (!tsConfigPath) {
        tsConfigPath = findNearestTsConfig(actualProjectDirectory)
      }

      if (tsConfigPath) {
        signale.info(`Using tsconfig: "${tsConfigPath}"`)
      } else {
        signale.warn('No tsconfig.json found - path aliases will not be resolved')
      }
    }

    const project = tsConfigPath
      ? new Project({
          tsConfigFilePath: tsConfigPath,
          skipAddingFilesFromTsConfig: true, // We'll add files manually via glob
        })
      : new Project()

    project.addSourceFilesAtPaths(projectGlob)

    const transformExports = Object.values(await import(transformPath))
    if (transformExports.length !== 1) {
      throw new Error('Transform file should have one named export with the transform function.')
    }

    const [codemod] = transformExports
    const codemodContext: CodemodContext = {
      project,
      shouldWriteFiles,
      shouldFormat,
      transformOptions: {
        ...transformOptions,
        reportPath,
        globalCssFiles,
        projectDir: actualProjectDirectory,
      },
    }

    const results = await (codemod as Codemod)(codemodContext)

    results.map(result => {
      logRequiredManualChanges(result.manualChangesReported)
    })

    if (shouldWriteFiles) {
      signale.await('Persisting codemod changes to the filesystem...')
      await Promise.all(
        results.map(result => {
          return result.fsWritePromise
        })
      )
      signale.complete('Persisting codemod changes completed.')
    } else {
      for (const file of results.flatMap(result => {
        return result.files
      })) {
        signale.log(file?.source)
      }
    }

    signale.success('Codemod is applied!')
  })

program.parse(process.argv)

interface ParseOptionsResult {
  fileGlob: string
  transformOptions: TransformOptions
}

function parseOptions(commandArgument: string): ParseOptionsResult {
  const { unknown } = program.parseOptions(process.argv)

  // TODO: find a better way to process and validate `transformOptions`.
  const fileGlob = unknown.pop() || commandArgument

  const transformOptions = unknown.reduce<Record<string, unknown>>((result, key) => {
    const [name, value = true] = key.split('=')
    result[name.replace('--', '')] = value

    return result
  }, {})

  return { fileGlob, transformOptions }
}
