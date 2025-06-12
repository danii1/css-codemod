import { AcceptedPlugin, Container } from 'postcss'

/**
 * PostCSS plugin that removes all @import statements.
 */
export function updateImportsPlugin(): AcceptedPlugin {
  return {
    postcssPlugin: 'postcss-update-imports',
    AtRule(atRule) {
      const { name } = atRule

      /**
       * Remove all @import statements.
       */
      if (name === 'import') {
        // To avoid resetting `raws` which changes line-breaks — use `Container.removeChild()`
        // https://github.com/postcss/postcss/blob/75966a9d069be54c997d8b40358342e23bb81328/lib/root.js#L18
        Container.prototype.removeChild.call(atRule.parent, atRule)
      }
    },
  }
}
