import path from 'path'

import { Project } from 'ts-morph'

import { globalCssToCssModule } from '../globalCssToCssModule'

const TARGET_FILE = path.resolve(__dirname, './fixtures/MyComponent.tsx')
const TARGET_FILE_WITH_CSS_IMPORT = path.resolve(__dirname, './fixtures/ComponentWithCssImport.tsx')
const TARGET_FILE_WITH_UNDERSCORES = path.resolve(__dirname, './fixtures/ComponentWithUnderscores.tsx')
const TARGET_FILE_WITH_HYPHENS = path.resolve(__dirname, './fixtures/ComponentWithHyphens.tsx')
const TARGET_FILE_WITH_MIXED_NOTATION = path.resolve(__dirname, './fixtures/ComponentWithMixedNotation.tsx')
const TARGET_FILE_WITH_NESTED_SELECTORS = path.resolve(__dirname, './fixtures/ComponentWithNestedSelectors.tsx')
const TARGET_FILE_WITH_ACTUAL_NESTING = path.resolve(__dirname, './fixtures/ComponentWithActualNesting.tsx')
const TARGET_FILE_WITH_PASCAL_CASE = path.resolve(__dirname, './fixtures/ComponentWithPascalCase.tsx')

describe('globalCssToCssModule', () => {
  beforeEach(() => {
    // signale.disable()
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

  it('handles hyphen-separated class names correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_HYPHENS)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that hyphen-separated class names are converted to camelCase
      expect(reactComponent.source).toContain('styles.playlistStatsUser')
      expect(reactComponent.source).toContain('styles.playlistStatsUserAvatar')
      expect(reactComponent.source).toContain('styles.componentSectionTitle')
      expect(reactComponent.source).toContain('styles.buttonPrimaryLarge')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)

  it('handles mixed hyphen and underscore notation correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_MIXED_NOTATION)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that mixed notation class names are converted to camelCase
      expect(reactComponent.source).toContain('styles.componentSectionTitle')
      expect(reactComponent.source).toContain('styles.playlistStatsUserAvatar')
      expect(reactComponent.source).toContain('styles.buttonPrimaryLarge')
      expect(reactComponent.source).toContain('styles.menuItemContainerActive')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)

  it('handles nested selectors with multiple underscores correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_NESTED_SELECTORS)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that nested selectors are handled correctly
      // The issue: selected-list__item__selected should become selectedListItemSelected, not selected
      expect(reactComponent.source).toContain('styles.selectedListItemSelected')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)

  it('handles PascalCase class names correctly', async () => {
    const project = new Project()
    project.addSourceFilesAtPaths(TARGET_FILE_WITH_PASCAL_CASE)
    const [{ files }] = await globalCssToCssModule({ project, shouldFormat: true })

    expect(files).toBeTruthy()

    if (files) {
      const [cssModule, reactComponent] = files

      // Check that PascalCase class names are converted to camelCase
      expect(reactComponent.source).toContain('styles.contactHeader')
      expect(reactComponent.source).toContain('styles.contactHeaderTitle')
      expect(reactComponent.source).toContain('styles.contactHeaderActive')
      expect(reactComponent.source).toContain('styles.userProfile')
      expect(reactComponent.source).toContain('styles.userProfileAvatar')

      // Check that CSS class names are converted to lowercase/camelCase
      expect(cssModule.source).toContain('.contactHeader')
      expect(cssModule.source).toContain('.userProfile')
      expect(cssModule.source).not.toContain('.ContactHeader')
      expect(cssModule.source).not.toContain('.UserProfile')

      expect(cssModule.source).toMatchSnapshot()
      expect(reactComponent.source).toMatchSnapshot()
    }
  }, 15000)

  it('skips transformation when no CSS module classes would be created', async () => {
    const project = new Project()

    // Create a component that has ONLY global classes
    const tsFile = project.createSourceFile('ComponentWithOnlyGlobalClasses.tsx', `
import React from 'react'

export const ComponentWithOnlyGlobalClasses = () => {
    return (
        <div className="d-flex justify-content-center">
            <p className="text-primary mb-3">Title with only global classes</p>
            <button className="btn btn-primary">Button with only Bootstrap classes</button>
        </div>
    )
}
`)

    // Create an empty CSS file - this will trigger our new guardrail 
    // since no CSS module classes would be created
    const cssFile = project.createSourceFile('ComponentWithOnlyGlobalClasses.css', `
/* Empty CSS file - no classes defined */
`)

    // Mock file system
    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('ComponentWithOnlyGlobalClasses.css') },
      readFileSync: (path: string) => {
        if (path.includes('ComponentWithOnlyGlobalClasses.css')) {
          return cssFile.getFullText()
        }
        return ''
      },
      writeFile: jest.fn(),
      delete: jest.fn(),
    }

    project.getFileSystem = () => { return mockFs as any }

    const [result] = await globalCssToCssModule({
      project,
      shouldWriteFiles: false,
      shouldFormat: false
    })

    expect(result.files).toBeTruthy()

    if (result.files) {
      // Should only return the original TypeScript file, no CSS module
      expect(result.files).toHaveLength(1)
      const [reactComponent] = result.files

      // Should NOT import CSS module
      expect(reactComponent.source).not.toContain('import styles from "./ComponentWithOnlyGlobalClasses.module.css"')

      // Should NOT transform any class names - they should remain as strings
      expect(reactComponent.source).toContain('className="d-flex justify-content-center"')
      expect(reactComponent.source).toContain('className="text-primary mb-3"')
      expect(reactComponent.source).toContain('className="btn btn-primary"')

      // Should NOT add classNames import since no transformation occurred
      expect(reactComponent.source).not.toContain('import classNames from "classnames"')

      // The file should be exactly the same as the original
      expect(reactComponent.source.trim()).toBe(tsFile.getFullText().trim())
    }
  }, 15000)

  it('skips transformation when global class names would remain (mixed usage)', async () => {
    const project = new Project()

    // Create a component that has BOTH CSS module classes AND global classes
    const tsFile = project.createSourceFile('ComponentWithMixedClasses.tsx', `
import React from 'react'

export const ComponentWithMixedClasses = () => {
    return (
        <div className="my-component d-flex">
            <p className="my-component__title text-primary">Title with mixed classes</p>
            <button className="my-component__button btn btn-primary">Button with mixed classes</button>
        </div>
    )
}
`)

    // Create CSS file that defines SOME of the classes (CSS module classes)
    // while others remain global (d-flex, text-primary, btn, btn-primary)
    // This should now be BLOCKED by our stricter guardrail
    const cssFile = project.createSourceFile('ComponentWithMixedClasses.css', `
.my-component {
    display: block;
    padding: 16px;
}

.my-component__title {
    font-size: 18px;
    font-weight: bold;
}

.my-component__button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
}
`)

    // Mock file system
    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('ComponentWithMixedClasses.css') },
      readFileSync: (path: string) => {
        if (path.includes('ComponentWithMixedClasses.css')) {
          return cssFile.getFullText()
        }
        return ''
      },
      writeFile: jest.fn(),
      delete: jest.fn(),
    }

    project.getFileSystem = () => { return mockFs as any }

    const [result] = await globalCssToCssModule({
      project,
      shouldWriteFiles: false,
      shouldFormat: false
    })

    expect(result.files).toBeTruthy()

    if (result.files) {
      // Should only return the original TypeScript file, no CSS module (transformation blocked)
      expect(result.files).toHaveLength(1)
      const [reactComponent] = result.files

      // Should NOT import CSS module
      expect(reactComponent.source).not.toContain('import styles from "./ComponentWithMixedClasses.module.css"')

      // Should NOT transform any class names - they should remain as strings
      expect(reactComponent.source).toContain('className="my-component d-flex"')
      expect(reactComponent.source).toContain('className="my-component__title text-primary"')
      expect(reactComponent.source).toContain('className="my-component__button btn btn-primary"')

      // Should NOT add classNames import since no transformation occurred
      expect(reactComponent.source).not.toContain('import classNames from "classnames"')

      // The file should be exactly the same as the original
      expect(reactComponent.source.trim()).toBe(tsFile.getFullText().trim())
    }
  }, 15000)

  it('allows transformation when all classes are defined in CSS module', async () => {
    const project = new Project()

    // Create a component where ALL classes are defined in the CSS file
    const tsFile = project.createSourceFile('ComponentWithAllCssModuleClasses.tsx', `
import React from 'react'

export const ComponentWithAllCssModuleClasses = () => {
    return (
        <div className="container">
            <h1 className="title">Welcome</h1>
            <p className="description">This component only uses CSS module classes</p>
            <button className="button primary">Click me</button>
        </div>
    )
}
`)

    // Create CSS file that defines ALL classes used in the component
    const cssFile = project.createSourceFile('ComponentWithAllCssModuleClasses.css', `
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.title {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 16px;
}

.description {
    font-size: 16px;
    color: #666;
    margin-bottom: 20px;
}

.button {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.primary {
    background-color: #007bff;
    color: white;
}
`)

    // Mock file system
    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('ComponentWithAllCssModuleClasses.css') },
      readFileSync: (path: string) => {
        if (path.includes('ComponentWithAllCssModuleClasses.css')) {
          return cssFile.getFullText()
        }
        return ''
      },
      writeFile: jest.fn(),
      delete: jest.fn(),
    }

    project.getFileSystem = () => { return mockFs as any }

    const [result] = await globalCssToCssModule({
      project,
      shouldWriteFiles: false,
      shouldFormat: false
    })

    expect(result.files).toBeTruthy()

    if (result.files) {
      // Should return CSS module, transformed TypeScript file, and TypeScript declaration file
      expect(result.files).toHaveLength(3)
      const [cssModule, reactComponent, typeDefinitions] = result.files

      // Should import CSS module
      expect(reactComponent.source).toContain('import styles from "./ComponentWithAllCssModuleClasses.module.css"')

      // Should transform all classes to CSS module references
      expect(reactComponent.source).toContain('styles.container')
      expect(reactComponent.source).toContain('styles.title')
      expect(reactComponent.source).toContain('styles.description')
      expect(reactComponent.source).toContain('styles.button')
      expect(reactComponent.source).toContain('styles.primary')

      // Should NOT contain any string literals for class names
      expect(reactComponent.source).not.toContain('className="container"')
      expect(reactComponent.source).not.toContain('className="title"')
      expect(reactComponent.source).not.toContain('className="description"')
      expect(reactComponent.source).not.toContain('className="button primary"')

      // CSS module should be created with all classes
      expect(cssModule.source).toContain('.container')
      expect(cssModule.source).toContain('.title')
      expect(cssModule.source).toContain('.description')
      expect(cssModule.source).toContain('.button')
      expect(cssModule.source).toContain('.primary')
    }
  }, 15000)

  it('allows transformation when global classes are defined in provided global CSS files', async () => {
    const project = new Project()

    // Create a component that has BOTH CSS module classes AND global classes
    const tsFile = project.createSourceFile('ComponentWithGlobalClasses.tsx', `
import React from 'react'

export const ComponentWithGlobalClasses = () => {
    return (
        <div className="my-component d-flex">
            <p className="my-component__title text-primary">Title with mixed classes</p>
            <button className="my-component__button btn btn-primary">Button with mixed classes</button>
        </div>
    )
}
`)

    // Create CSS file that defines SOME of the classes (CSS module classes)
    // while others remain global (d-flex, text-primary, btn, btn-primary)
    const cssFile = project.createSourceFile('ComponentWithGlobalClasses.css', `
.my-component {
    display: block;
    padding: 16px;
}

.my-component__title {
    font-size: 18px;
    font-weight: bold;
}

.my-component__button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
}
`)

    // Create a global CSS file that defines the global classes
    const globalCssFile = project.createSourceFile('global.css', `
.d-flex {
    display: flex;
}

.text-primary {
    color: #007bff;
}

.btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
}

.btn-primary {
    background-color: #007bff;
    border-color: #007bff;
    color: #fff;
}
`)

    // Mock file system
    const mockFs = {
      fileExistsSync: (path: string) => {
        return path.includes('ComponentWithGlobalClasses.css') || path.includes('global.css')
      },
      readFileSync: (path: string) => {
        if (path.includes('ComponentWithGlobalClasses.css')) {
          return cssFile.getFullText()
        }
        if (path.includes('global.css')) {
          return globalCssFile.getFullText()
        }
        return ''
      },
      writeFile: jest.fn(),
      delete: jest.fn(),
    }

    project.getFileSystem = () => { return mockFs as any }

    const [result] = await globalCssToCssModule({
      project,
      shouldWriteFiles: false,
      shouldFormat: false,
      transformOptions: {
        globalCssFiles: ['global.css']
      }
    })

    expect(result.files).toBeTruthy()

    if (result.files) {
      // Should return CSS module, transformed TypeScript file, and TypeScript declaration file
      expect(result.files).toHaveLength(3)
      const [cssModule, reactComponent, typeDefinitions] = result.files

      // Should import CSS module
      expect(reactComponent.source).toContain('import styles from "./ComponentWithGlobalClasses.module.css"')

      // Should transform CSS module classes to CSS module references
      expect(reactComponent.source).toContain('styles.myComponent')
      expect(reactComponent.source).toContain('styles.myComponentTitle')
      expect(reactComponent.source).toContain('styles.myComponentButton')

      // Should keep global classes as string literals (not transformed)
      expect(reactComponent.source).toContain('"d-flex"')
      expect(reactComponent.source).toContain('"text-primary"')
      expect(reactComponent.source).toContain('"btn btn-primary"')

      // Should add classNames import since we have mixed usage
      expect(reactComponent.source).toContain('import classNames from "classnames"')

      // CSS module should be created with component-specific classes
      expect(cssModule.source).toContain('.myComponent')
      expect(cssModule.source).toContain('.myComponentTitle')
      expect(cssModule.source).toContain('.myComponentButton')
    }
  }, 15000)

})
