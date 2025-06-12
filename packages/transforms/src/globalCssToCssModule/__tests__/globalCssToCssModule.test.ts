import path from 'path'

import signale from 'signale'
import { Project } from 'ts-morph'

import { globalCssToCssModule } from '../globalCssToCssModule'

const TARGET_FILE = path.resolve(__dirname, './fixtures/MyComponent.tsx')
const TARGET_FILE_WITH_CSS_IMPORT = path.resolve(__dirname, './fixtures/ComponentWithCssImport.tsx')
const TARGET_FILE_WITH_UNDERSCORES = path.resolve(__dirname, './fixtures/ComponentWithUnderscores.tsx')

describe('globalCssToCssModule', () => {
  beforeEach(() => {
    signale.disable()
  })

  it('transforms correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000) // Timeout of 15s (default is 5s). `prettier-eslint` format is slow 😬.

  it('removes existing CSS import and adds CSS module import', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_CSS_IMPORT)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that the original CSS import is removed
      expect(reactComponent.source).not.toContain("import './ComponentWithCssImport.css'")

      // Check that the CSS module import is added
      expect(reactComponent.source).toContain("import styles from './ComponentWithCssImport.module.css'")

      // Check that class names are transformed
      expect(reactComponent.source).toContain('styles.testClass')
      expect(reactComponent.source).toContain('styles.anotherClass')
      expect(reactComponent.source).toContain('styles.nestedClass')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)

  it('handles underscore-separated class names correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_UNDERSCORES)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that underscore-separated class names are converted to camelCase
      expect(reactComponent.source).toContain('styles.trackTooltipKeyTagsItem')
      expect(reactComponent.source).toContain('styles.componentSectionTitle')
      expect(reactComponent.source).toContain('styles.buttonPrimaryLarge')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)
})
