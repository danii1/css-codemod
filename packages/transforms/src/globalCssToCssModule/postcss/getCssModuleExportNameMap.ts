import camelcase from 'camelcase'
import CssModuleLoaderCore, { Source } from 'css-modules-loader-core'
import postcssNested from 'postcss-nested'

import { createCssProcessor } from './createCssProcessor'
import { postcssToCssModulePlugin } from './postcssToCssModulePlugin'

const EXPORT_NAME_PREFIX = 'prefix'

// The simplest subset of logic used by css-modules loaders and processors.
const cssModulesLoaderCore = new CssModuleLoaderCore()
const noOpPathFetcher = (): void => { }
const sourceCssToClassNames = (source: Source): Promise<Core.Result> => {
  return cssModulesLoaderCore.load(source, EXPORT_NAME_PREFIX, undefined, noOpPathFetcher)
}

const transformToCssModuleProcessor = createCssProcessor(postcssNested, postcssToCssModulePlugin())

/**
 * Convert underscore-separated and hyphen-separated class names to camelCase
 * TrackTooltip_KeyTags_Item -> trackTooltipKeyTagsItem
 * PlaylistStats-user-avatar -> playlistStatsUserAvatar
 */
function convertToCamelCase(className: string): string {
  return camelcase(className)
}

/**
 * Get a mapping between export names that will be used in the TS file and CSS classes.
 */
export async function getCssModuleExportNameMap(sourceCss: string): Promise<Record<string, string>> {
  // Extract @keyframes names to exclude them from the export map
  const keyframesNames = new Set<string>()
  const keyframesRegex = /@keyframes\s+([\w-]+)/g
  let keyframeMatch: RegExpExecArray | null = null
  keyframeMatch = keyframesRegex.exec(sourceCss)
  while (keyframeMatch !== null) {
    keyframesNames.add(keyframeMatch[1])
    keyframeMatch = keyframesRegex.exec(sourceCss)
  }

  // First, get the transformed CSS with camelCase class names
  const transformedResult = await transformToCssModuleProcessor(sourceCss)
  const classNames = await sourceCssToClassNames(transformedResult.css)

  // Create a reverse mapping from camelCase back to original class names
  // We need to first expand the nested CSS to get all the actual class names
  const camelCaseToOriginalMap = new Map<string, string>()

  // First, expand the nested CSS to get all actual class names
  const expandedCssResult = await createCssProcessor(postcssNested)(sourceCss)
  const expandedClassMatches = expandedCssResult.css.match(/\.([A-Z_a-z][\w-]*)/g) || []

  for (const match of expandedClassMatches) {
    const originalClassName = match.slice(1) // Remove the dot

    // Skip class names that are inside :global() selectors
    const matchIndex = expandedCssResult.css.indexOf(match)
    const beforeMatch = expandedCssResult.css.slice(0, Math.max(0, matchIndex))
    const lastGlobalStart = beforeMatch.lastIndexOf(':global(')
    const lastGlobalEnd = beforeMatch.lastIndexOf(')')

    // If we're inside a :global() selector, skip this class name
    if (lastGlobalStart > lastGlobalEnd) {
      continue
    }

    if (originalClassName.includes('_') || originalClassName.includes('-') || /^[A-Z]/.test(originalClassName)) {
      const camelCaseClassName = convertToCamelCase(originalClassName)
      camelCaseToOriginalMap.set(camelCaseClassName, originalClassName)
    }
  }

  const exportNameClassNamePairs: [string, string][] = Object.entries(classNames.exportTokens)
    .filter(([exportName]) => {
      // Filter out @keyframes animation names from the export map
      // CSS Modules includes them as exports, but they're not CSS classes
      return !keyframesNames.has(exportName)
    })
    .map(
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

  // Disable prefix removal to avoid bugs with nested classes
  // const prefixesToRemove = getPrefixesToRemove(initialExportNameMap)

  // const exportNameMapPairs: [string, string][] = Object.entries(initialExportNameMap).map(
  //   ([className, exportName]) => {
  //     const exportNameWithoutPrefix = removePrefixFromExportNameIfNeeded({
  //       className,
  //       exportName,
  //       prefixesToRemove,
  //     })

  //     return [className, exportNameWithoutPrefix]
  //   }
  // )

  /**
   * Export name map without prefix removal:
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
  return initialExportNameMap
}
