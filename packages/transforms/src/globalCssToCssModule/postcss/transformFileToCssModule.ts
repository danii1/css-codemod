import path from 'path'

import { createCssProcessor } from './createCssProcessor'
import { getCssModuleExportNameMap } from './getCssModuleExportNameMap'
import { postcssToCssModulePlugin } from './postcssToCssModulePlugin'
import { updateImportsPlugin } from './updateImportsPlugin'

interface TransformFileToCssModuleOptions {
  sourceCss: string
  sourceFilePath: string
}

interface TransformFileToCssModuleResult {
  css: string
  filePath: string
  typeDefinitions: string
  typeDefinitionsPath: string
}

/**
 * Generate TypeScript type definitions for CSS module
 */
function generateTypeDefinitions(exportNameMap: Record<string, string>): string {
  const typeDefinitions = Object.entries(exportNameMap)
    .map(([, exportName]) => {
      return `  ${exportName}: string;`
    })
    .join('\n')

  return `declare const styles: {
${typeDefinitions}
};

export default styles;
`
}

export async function transformFileToCssModule(
  options: TransformFileToCssModuleOptions
): Promise<TransformFileToCssModuleResult> {
  const { sourceCss, sourceFilePath } = options

  const transformFileToCssModuleProcessor = createCssProcessor(updateImportsPlugin(), postcssToCssModulePlugin())
  const transformedResult = await transformFileToCssModuleProcessor(sourceCss)

  const { dir, name } = path.parse(sourceFilePath)
  const newFilePath = path.join(dir, `${name}.module.css`)
  const typeDefinitionsPath = path.join(dir, `${name}.module.css.d.ts`)

  // Get export name map for type definitions
  const exportNameMap = await getCssModuleExportNameMap(sourceCss)
  const typeDefinitions = generateTypeDefinitions(exportNameMap)

  return {
    css: transformedResult.css,
    filePath: newFilePath,
    typeDefinitions,
    typeDefinitionsPath,
  }
}
