import camelcase from 'camelcase'

import { decapitalize } from '@sourcegraph/codemod-common'

interface RemovedPrefix {
  prefix: string
  exportName: string
}

interface RemovePrefixFromExportNameIfNeededOptions {
  className: string
  exportName: string
  prefixesToRemove: RemovedPrefix[]
}

/**
 * If `className` starts with `prefix__` and `exportName` starts with `prefix` -> remove `prefix` from the export name.
 *
 * ```ts
 * const exportName = removePrefixFromExportNameIfNeeded({
 *     className: 'menu__button',
 *     exportName: 'menuButton',
 *     prefixesToRemove: [{ prefix: 'menu__', exportName: 'menu' }]
 * })
 *
 * exportName === 'button'
 * ```
 */
export function removePrefixFromExportNameIfNeeded(options: RemovePrefixFromExportNameIfNeededOptions): string {
  const { className, exportName, prefixesToRemove } = options

  const removedPrefix = prefixesToRemove.find(removedPrefix => {
    return exportName.startsWith(removedPrefix.exportName) && className.startsWith(removedPrefix.prefix)
  })

  if (removedPrefix) {
    return decapitalize(exportName.replace(removedPrefix.exportName, ''))
  }

  return exportName
}

/**
 * Upon conversion to the CSS module, we lift `&__` nested selectors to the root level:
 *
 * ```scss
 * .menu {
 *   &__button { ... }
 * }
 *
 * .menu {}
 * .button {}
 * ```
 *
 * Here `menu__` is a removed prefix because className changed:
 * .menu__button -> .button
 *
 * However, we should only remove prefixes when we have evidence of actual nesting.
 * A standalone class like `.selected-list__item__selected` should NOT have its prefix removed.
 */
export function getPrefixesToRemove(exportNameMap: Record<string, string>): RemovedPrefix[] {
  const classNames = Object.keys(exportNameMap)
  const prefixesToRemove: RemovedPrefix[] = []

  // Only create prefix removal rules when we have evidence of actual nesting
  // i.e., when we have both the parent class and the nested class
  for (const className of classNames) {
    const matches = className.match(/(.+)__/)
    if (matches) {
      const potentialParentClass = matches[1]

      // Only remove prefix if the parent class also exists in the export map
      // This indicates actual nesting, not just a standalone class with multiple underscores
      if (exportNameMap[potentialParentClass]) {
        prefixesToRemove.push({
          prefix: matches[0],
          exportName: camelcase(potentialParentClass),
        })
      }
    }
  }

  return [...new Set(prefixesToRemove)]
}
