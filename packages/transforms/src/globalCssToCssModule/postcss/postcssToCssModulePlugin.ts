/* eslint-disable rxjs/throw-error, etc/throw-error */
import camelcase from 'camelcase'
import { AcceptedPlugin, Rule, ChildNode, Root } from 'postcss'
import parser, { isRoot, Selector } from 'postcss-selector-parser'

interface PostcssToCssModulePluginOptions {
  // Classes that will be wrapped into a :global() keyword.
  globalTopLevelClasses?: string[]
}

/**
 * Convert underscore-separated and hyphen-separated class names to camelCase
 * TrackTooltip_KeyTags_Item -> trackTooltipKeyTagsItem
 * PlaylistStats-user-avatar -> playlistStatsUserAvatar
 */
function convertToCamelCase(className: string): string {
  return camelcase(className)
}

// Based on the implementation of the `postcss-nested` plugin:
// https://github.com/postcss/postcss-nested/blob/main/index.js
export function postcssToCssModulePlugin(options: PostcssToCssModulePluginOptions = {}): AcceptedPlugin {
  const { globalTopLevelClasses = ['.theme-light', '.theme-dark'] } = options
  let definedClasses: Set<string>

  return {
    postcssPlugin: 'postcss-to-css-module',
    Root(root) {
      if (root.last) {
        // Remove default spacing applied by `postcss`.
        root.last.raws.before = undefined
      }

      // Collect all class names defined in this CSS file
      definedClasses = new Set<string>()

      // Collect classes that are actually defined (not just referenced)
      const collectDefinedClassNames = (rule: Rule): void => {
        // Only collect from truly root-level rules (not nested rules)
        if (!isRoot(rule.parent)) {
          return
        }

        const selector = rule.selector

        // Skip rules that are inside :global() - these are global references
        if (selector.includes(':global(')) {
          return
        }

        // Extract class names that are being defined at the root level
        const classMatches = selector.match(/^\.([A-Z_a-z][\w-]*)/g) // Only root-level classes
        if (classMatches) {
          for (const match of classMatches) {
            const className = match.slice(1) // Remove the dot
            definedClasses.add(className)
            // Also add the camelCase version if it would be converted
            if (className.includes('_') || className.includes('-') || /^[A-Z]/.test(className)) {
              definedClasses.add(convertToCamelCase(className))
            }
          }
        }

        // Also collect BEM-style nested selectors that will be flattened
        // e.g., .repo-header &__button becomes .repoHeaderButton
        // We need to walk through the rule's children to find these
        rule.walkRules(childRule => {
          const childSelector = childRule.selector
          if (childSelector.includes('&__') || childSelector.includes('&_')) {
            const parentMatch = selector.match(/^\.([A-Z_a-z][\w-]*)/)
            if (parentMatch) {
              const parentClass = parentMatch[1]
              const bemMatches = childSelector.match(/&(_{1,2}[A-Z_a-z][\w-]*)/g)
              if (bemMatches) {
                for (const bemMatch of bemMatches) {
                  const bemSuffix = bemMatch.slice(1) // Remove &
                  const fullClassName = parentClass + bemSuffix
                  definedClasses.add(fullClassName)
                  definedClasses.add(convertToCamelCase(fullClassName))
                }
              }
            }
          }
        })
      }

      // Collect from all rules in the root
      root.walkRules(collectDefinedClassNames)
    },
    Rule(parentRule) {
      const isRootRule = isRoot(parentRule.parent)

      /**
       * Check if root level selectors include well-known global classes and wrap them
       * into a `:global()` keyword in case of a match.
       *
       * ```scss
       * .theme-light -> :global(.theme-light)
       * ```
       */
      if (
        isRootRule &&
        globalTopLevelClasses.some(globalClass => {
          return parentRule.selector.includes(globalClass)
        })
      ) {
        for (const globalClass of globalTopLevelClasses) {
          parentRule.selector = parentRule.selector.replace(
            globalClass,
            wrapSelectorInGlobalKeyword(globalClass)
          )
        }
      }

      /**
       * Do not process children of `globalTopLevelClasses`
       *
       * ```scss
       * .theme-dark {
       *   .repo-header {
       *     border: 1px red;
       *   }
       * }
       *
       * Turns into:
       *
       * :global(.theme-dark) {
       *   .repo-header {
       *     border: 1px red;
       *   }
       * }
       * ```
       *
       * Note that the `.repo-header` selector is not affected.
       *
       */
      if (isRootRule && parentRule.selector.includes(':global(')) {
        return
      }

      // Transform underscore-separated, hyphen-separated, and PascalCase class names to camelCase
      // But skip class names that are inside :global() selectors
      if (!parentRule.selector.includes(':global(')) {
        parentRule.selector = parentRule.selector.replace(/\.([A-Z_a-z][\w-]*)/g, (match, className) => {
          // Transform if the class name contains underscores, hyphens, or starts with uppercase (PascalCase)
          if (className.includes('_') || className.includes('-') || /^[A-Z]/.test(className)) {
            return '.' + convertToCamelCase(className)
          }
          return match
        })
      }

      // Go through all child selectors and remove redundant nesting according to our guidelines:
      // https://docs.sourcegraph.com/dev/background-information/web/styling#css-modules
      parentRule.each(child => {
        if (child.type === 'rule') {
          child.selectors = updateChildSelectors(parentRule, child, definedClasses)
        }
      })
    },
  }
}

function updateChildSelectors(parent: Rule, child: Rule, definedClasses: Set<string>): string[] {
  let shouldRemoveNesting = false

  const updatedChildSelectors = child.selectors.reduce<string[]>((result, selectorString) => {
    if (selectorString.length !== 0) {
      const selectorNode = parse(selectorString, child)
      shouldRemoveNesting = replaceSelectorNodesIfNeeded(selectorNode, parent.selector, definedClasses)

      result.push(selectorNode.toString())
    }

    return result
  }, [])

  // If nesting should be removed, uplift nested selector to the direct child level.
  if (shouldRemoveNesting) {
    /**
     * Preserve comment above the selector on nesting removal.
     *
     * ```scss
     * .menu {
     *   ...
     *
     *   Some important comment about &__button selector.
     *   &__button { ... }
     * }
     *
     * Turns into:
     *
     * .menu { ... }
     *
     * Some important comment about &__button selector.
     * .button { ... }
     */
    pickComment(child.prev(), parent.root())
    parent.root().last?.after(child)
  }

  if (parent.nodes.length === 0) {
    parent.remove()
  }

  return updatedChildSelectors
}

function replaceSelectorNodesIfNeeded(nodes: Selector, parentSelector: string, definedClasses: Set<string>): boolean {
  return nodes.reduce<boolean>((shouldRemoveNesting, node, index) => {
    /**
     * Only wrap classes in :global() if they are not defined in the same file
     * and don't follow our naming conventions (underscores, hyphens, PascalCase)
     *
     * Example:
     *
     * ```scss
     * .menu {
     *   .nav-bar { ... } -> :global(.nav-bar) { ... }  // if nav-bar is not defined in this file
     *   .Menu_Item { ... } -> .menuItem { ... }         // if Menu_Item is defined in this file
     * }
     */
    if (node.type === 'class' || node.type === 'id') {
      const className = node.toString().replace(/^\./, '') // Remove leading dot

      // Check if this class is defined in the current CSS file
      const isDefinedInFile = definedClasses.has(className) ||
        definedClasses.has(convertToCamelCase(className))

      if (isDefinedInFile && (className.includes('_') || className.includes('-') || /^[A-Z]/.test(className))) {
        // If the class is defined in this file and follows our naming conventions,
        // convert it to camelCase
        const camelCaseClassName = convertToCamelCase(className)
        node.replaceWith(parse('.' + camelCaseClassName))
      } else if (!isDefinedInFile) {
        // If the class is not defined in this file, wrap it in :global()
        const globalClass = wrapSelectorInGlobalKeyword(node.toString())
        node.replaceWith(parse(globalClass))
      }
      // If the class is defined in the file but doesn't follow naming conventions, leave it as is
    }

    if (node.type === 'nesting') {
      if (node.value !== '&') {
        throw new Error(`Found unhandled nesting! ${node.value}`)
      }

      // Get text after ampersand operator: &--disabled or &__button.
      const nextNode = node.next()
      const nextNodeValue = nextNode?.value

      if (nextNodeValue) {
        if (nextNodeValue.startsWith('--')) {
          // Preserve nesting for modifier classes, e.g., `&--disabled`
        } else if (nextNodeValue.startsWith('__') || nextNodeValue.startsWith('_')) {
          /**
           * Remove nesting for selectors starting from `__` or `_`
           * Convert the full parent + child selector to camelCase
           *
           * ```scss
           * .rich-editor__merge-tag {
           *   &__fallback-popup { ... }
           * }
           *
           * Turns into:
           *
           * .richEditorMergeTag { ... }
           * .richEditorMergeTagFallbackPopup { ... }
           * ```
           */

          // Get the parent selector (e.g., ".rich-editor__merge-tag")
          const parentClassName = parentSelector.replace(/^\./, '') // Remove leading dot

          // Combine parent + child and convert to camelCase
          const fullClassName = parentClassName + nextNodeValue
          const camelCaseClassName = convertToCamelCase(fullClassName)

          // Replace the nesting with the full camelCase class name
          node.replaceWith(parse(''))
          nextNode.replaceWith(parse('.' + camelCaseClassName))

          /**
           * If its not the first node of the selector — keep nesting in place
           *
           * ```scss
           * .menu {
           *   &:hover &__button { ... }
           * }
           * ```
           *
           * Turns into:
           *
           * ```scss
           * .menu {
           *   &:hover .menuButton { ... }
           * }
           * ```
           */
          if (index === 0) {
            return true
          }
        }
      }
    }

    return shouldRemoveNesting
  }, false)
}

function wrapSelectorInGlobalKeyword(selector: string): string {
  return `:global(${selector})`
}

// If passed node is a comment -> attach it to the end of the file and return it, otherwise return the passed node.
function pickComment(maybeCommentNode: ChildNode | undefined, parent: Rule | Root): Rule | Root {
  if (maybeCommentNode && maybeCommentNode.type === 'comment') {
    parent.last?.after(maybeCommentNode)

    return maybeCommentNode as unknown as Rule
  }

  return parent
}

// Logic without changes from the `postcss-nested`:
// https://github.com/postcss/postcss-nested/blob/main/index.js#L3
function parse(source: string, rule?: Rule): Selector {
  let nodes: parser.Root | undefined

  const saver = parser(parsed => {
    nodes = parsed
  })

  try {
    saver.processSync(source)
  } catch (error) {
    if (source.includes(':')) {
      throw rule ? rule.error('Missed semicolon') : error
    } else if (error instanceof Error) {
      throw rule ? rule.error(error.message) : error
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return nodes!.at(0)
}
