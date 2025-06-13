/**
 * Example demonstrating how to use the globalCssFiles option
 * to allow transformation when global CSS classes are present.
 */

import { Project } from 'ts-morph'

import { globalCssToCssModule } from '../globalCssToCssModule'

async function exampleUsage() {
  const project = new Project()

  // Add your source files
  project.addSourceFilesAtPaths('src/**/*.tsx')

  // Run the transformation with global CSS files specified
  const results = await globalCssToCssModule({
    project,
    shouldWriteFiles: true,
    shouldFormat: true,
    transformOptions: {
      // Specify global CSS files that contain classes that shouldn't prevent conversion
      globalCssFiles: [
        'src/styles/bootstrap.css',
        'src/styles/global.css',
        'node_modules/bootstrap/dist/css/bootstrap.css'
      ],
      // Optional: Generate a report of remaining problematic classes
      reportPath: 'css-conversion-report.html'
    }
  })

  console.log(`Processed ${results.length} files`)
}

// Example component that would benefit from this feature:
/*
// Component.tsx
export const Component = () => (
  <div className="my-component d-flex">
    <h1 className="my-component__title text-primary">Title</h1>
    <button className="my-component__button btn btn-primary">Click me</button>
  </div>
)

// Component.css
.my-component {
  padding: 16px;
}

.my-component__title {
  font-size: 24px;
}

.my-component__button {
  margin-top: 8px;
}

// global.css (or bootstrap.css)
.d-flex { display: flex; }
.text-primary { color: #007bff; }
.btn { padding: 0.375rem 0.75rem; }
.btn-primary { background-color: #007bff; }

// After transformation:
// Component.tsx becomes:
export const Component = () => (
  <div className={classNames("d-flex", styles.myComponent)}>
    <h1 className={classNames("text-primary", styles.myComponentTitle)}>Title</h1>
    <button className={classNames("btn btn-primary", styles.myComponentButton)}>Click me</button>
  </div>
)
*/

export { exampleUsage } 
