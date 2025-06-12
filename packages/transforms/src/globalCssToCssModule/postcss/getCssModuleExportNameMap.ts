import camelcase from 'camelcase'
import CssModuleLoaderCore, { Source } from 'css-modules-loader-core'
import postcssNested from 'postcss-nested'

import { createCssProcessor } from './createCssProcessor'
import { getPrefixesToRemove, removePrefixFromExportNameIfNeeded } from './exportNameMapPrefixes'
import { postcssToCssModulePlugin } from './postcssToCssModulePlugin'

const EXPORT_NAME_PREFIX = 'prefix'

// The simplest subset of logic used by css-modules loaders and processors.
const cssModulesLoaderCore = new CssModuleLoaderCore()
const noOpPathFetcher = (): void => { }
const sourceCssToClassNames = (source: Source): Promise<Core.Result> => {
  return cssModulesLoaderCore.load(source, EXPORT_NAME_PREFIX, undefined, noOpPathFetcher)
}

const removeCssNestingProcessor = createCssProcessor(postcssNested)
const transformToCssModuleProcessor = createCssProcessor(postcssNested, postcssToCssModulePlugin())

/**
 * Convert underscore-separated class names to camelCase
 * TrackTooltip_KeyTags_Item -> trackTooltipKeyTagsItem
 */
function convertUnderscoresToCamelCase(className: string): string {
  return camelcase(className)
}

/**
 * Get a mapping between export names that will be used in the TS file and CSS classes.
 */
export async function getCssModuleExportNameMap(sourceCss: string): Promise<Record<string, string>> {
  // First, get the transformed CSS with camelCase class names
  const transformedResult = await transformToCssModuleProcessor(sourceCss)
  const classNames = await sourceCssToClassNames(transformedResult.css)

  // Create a reverse mapping from camelCase back to original underscore names
  const camelCaseToOriginalMap = new Map<string, string>()

  // Extract original class names from source CSS
  const originalClassMatches = sourceCss.match(/\.([A-Z_a-z]\w*)/g) || []
  for (const match of originalClassMatches) {
    const originalClassName = match.slice(1) // Remove the dot
    if (originalClassName.includes('_')) {
      const camelCaseClassName = convertUnderscoresToCamelCase(originalClassName)
      camelCaseToOriginalMap.set(camelCaseClassName, originalClassName)
    }
  }

  const exportNameClassNamePairs: [string, string][] = Object.entries(classNames.exportTokens).map(
    ([exportName, className]) => {
      const classNameWithoutExportPrefix = className.replace(`_${EXPORT_NAME_PREFIX}__`, '')

      // Map back to original class name if it was transformed
      const originalClassName = camelCaseToOriginalMap.get(classNameWithoutExportPrefix) || classNameWithoutExportPrefix

      return [originalClassName, camelcase(exportName)]
    }
  )

  /**
   * Initial export name map without removed nesting of the selectors:
   *
   * ```scss
   * .menu {
   *     &__button {}
   * }
   * ```
   *
   * Export name map:
   *
   * ```ts
   * {
   *     menu: 'menu',
   *     menu__button: 'menuButton'
   * }
   * ```
   */
  const initialExportNameMap = Object.fromEntries<string>(exportNameClassNamePairs)
  const prefixesToRemove = getPrefixesToRemove(initialExportNameMap)

  const exportNameMapPairs: [string, string][] = Object.entries(initialExportNameMap).map(
    ([className, exportName]) => {
      const exportNameWithoutPrefix = removePrefixFromExportNameIfNeeded({
        className,
        exportName,
        prefixesToRemove,
      })

      return [className, exportNameWithoutPrefix]
    }
  )

  /**
   * Export name map _with_ removed nesting of the selectors:
   *
   * ```scss
   * .menu {
   *     &__button {}
   * }
   * ```
   *
   * Export name map:
   *
   * ```ts
   * {
   *     menu: 'menu',
   *     menu__button: 'button'
   * }
   * ```
   */
  return Object.fromEntries<string>(exportNameMapPairs)
}
