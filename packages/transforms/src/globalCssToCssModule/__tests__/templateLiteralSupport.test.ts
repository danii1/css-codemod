import { Project } from 'ts-morph'

import { globalCssToCssModule } from '../globalCssToCssModule'

describe('globalCssToCssModule template literal support', () => {
  it('transforms template literals with only static classes', async () => {
    const project = new Project()

    const tsFile = project.createSourceFile('SimpleComponent.tsx', `
import React from 'react'

export const SimpleComponent = () => {
    return (
        <div className={\`MyTeam_Badge d-flex\`}>
            Simple badge
        </div>
    )
}
`)

    const cssFile = project.createSourceFile('SimpleComponent.css', `
.MyTeam_Badge {
    display: inline-block;
    padding: 4px 8px;
}
`)

    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('SimpleComponent.css') },
      readFileSync: (path: string) => {
        if (path.includes('SimpleComponent.css')) {
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
      const [, reactComponent] = result.files

      // Should import classNames utility
      expect(reactComponent.source).toContain('import classNames from "classnames"')

      // Should import CSS module
      expect(reactComponent.source).toContain('import styles from "./SimpleComponent.module.css"')

      // Should transform to classNames call with CSS module and leftover classes
      expect(reactComponent.source).toContain('classNames(')
      expect(reactComponent.source).toContain('styles.myTeamBadge')
      expect(reactComponent.source).toContain('"d-flex"')
    }
  })

  it('skips entire transformation when dynamic parts are found', async () => {
    const project = new Project()

    // Create a test component with template literal className that has dynamic parts
    const tsFile = project.createSourceFile('TestComponent.tsx', `
import React from 'react'

export const TestComponent = ({ role }: { role: string }) => {
    return (
        <div className={\`MyTeam_Badge MyTeam_Badge--\${role}\`}>
            Badge content
        </div>
    )
}
`)

    // Create corresponding CSS file
    const cssFile = project.createSourceFile('TestComponent.css', `
.MyTeam_Badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
}

.MyTeam_Badge--admin {
    background-color: red;
    color: white;
}

.MyTeam_Badge--user {
    background-color: blue;
    color: white;
}
`)

    // Mock file system
    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('TestComponent.css') },
      readFileSync: (path: string) => {
        if (path.includes('TestComponent.css')) {
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
      expect(reactComponent.source).not.toContain('import styles from "./TestComponent.module.css"')

      // Should NOT transform the template literal with dynamic parts
      // The original template literal should remain unchanged
      expect(reactComponent.source).toContain('MyTeam_Badge MyTeam_Badge--${role}')

      // Should NOT add classNames import since no transformation occurred
      expect(reactComponent.source).not.toContain('import classNames from "classnames"')

      // The file should be exactly the same as the original
      expect(reactComponent.source.trim()).toBe(tsFile.getFullText().trim())
    }
  })

  it('skips transformation when component has both static and dynamic class usage', async () => {
    const project = new Project()

    // Create a component with both static string classes and dynamic template literals
    const tsFile = project.createSourceFile('MixedComponent.tsx', `
import React from 'react'

export const MixedComponent = ({ role, isActive }: { role: string; isActive: boolean }) => {
    return (
        <div>
            <div className="MyTeam_Badge">Static usage</div>
            <div className={\`MyTeam_Badge--\${role}\`}>Dynamic usage</div>
            <div className={isActive ? "MyTeam_Badge--active" : ""}>Conditional usage</div>
        </div>
    )
}
`)

    const cssFile = project.createSourceFile('MixedComponent.css', `
.MyTeam_Badge {
    display: inline-block;
    padding: 4px 8px;
}

.MyTeam_Badge--admin {
    background-color: red;
}

.MyTeam_Badge--active {
    border: 2px solid blue;
}
`)

    const mockFs = {
      fileExistsSync: (path: string) => { return path.includes('MixedComponent.css') },
      readFileSync: (path: string) => {
        if (path.includes('MixedComponent.css')) {
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
      expect(reactComponent.source).not.toContain('import styles from "./MixedComponent.module.css"')

      // Should NOT transform any class names
      expect(reactComponent.source).toContain('className="MyTeam_Badge"')
      expect(reactComponent.source).toContain('MyTeam_Badge--${role}')
      expect(reactComponent.source).toContain('className={isActive ? "MyTeam_Badge--active" : ""}')

      // Should NOT add classNames import
      expect(reactComponent.source).not.toContain('import classNames from "classnames"')

      // The file should be exactly the same as the original
      expect(reactComponent.source.trim()).toBe(tsFile.getFullText().trim())
    }
  })
}) 
