import fs from 'fs'
import path from 'path'

interface ClassUsage {
  className: string
  occurrences: number
  files: string[]
}

interface SkippedFile {
  filePath: string
  reason: string
  conflictingClasses: string[]
  conflictingFiles: string[]
}

export function generateReport(
  classUsages: ClassUsage[],
  outputPath: string,
  skippedFiles: SkippedFile[] = []
): void {
  // Sort by occurrences in descending order
  const sortedUsages = [...classUsages].sort((a, b) => {
    return b.occurrences - a.occurrences
  })

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSS Classes Preventing Conversion Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2 {
            color: #2c3e50;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
        }
        h2 {
            margin-top: 40px;
            border-bottom: 1px solid #eee;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .occurrences {
            font-weight: bold;
            color: #e74c3c;
        }
        .files {
            font-family: monospace;
            font-size: 0.9em;
            color: #666;
        }
        .reason {
            color: #f39c12;
            font-weight: 500;
        }
        .conflicting-classes {
            font-family: monospace;
            color: #e74c3c;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <h1>CSS Classes Preventing Conversion Report</h1>
    
    ${skippedFiles.length > 0 ? `
    <h2>Skipped Files (${skippedFiles.length})</h2>
    <p>These files were skipped due to class name conflicts in the project.</p>
    <table>
        <thead>
            <tr>
                <th>File Path</th>
                <th>Reason</th>
                <th>Conflicting Classes</th>
                <th>Conflicting Files</th>
            </tr>
        </thead>
        <tbody>
            ${skippedFiles.map(skipped => {
    return `
                <tr>
                    <td class="files">${skipped.filePath}</td>
                    <td class="reason">${skipped.reason}</td>
                    <td class="conflicting-classes">${skipped.conflictingClasses.join(', ')}</td>
                    <td class="files">${skipped.conflictingFiles.slice(0, 3).join('<br>')}${skipped.conflictingFiles.length > 3 ? `<br>... and ${skipped.conflictingFiles.length - 3} more` : ''}</td>
                </tr>
              `
  }).join('')}
        </tbody>
    </table>
    ` : ''}
    
    ${sortedUsages.length > 0 ? `
    <h2>Classes Preventing Conversion (${sortedUsages.length})</h2>
    <p>These classes prevent conversion to CSS modules, sorted by number of occurrences.</p>
    <table>
        <thead>
            <tr>
                <th>Class Name</th>
                <th>Occurrences</th>
                <th>Files</th>
            </tr>
        </thead>
        <tbody>
            ${sortedUsages.map(usage => {
    return `
                <tr>
                    <td>${usage.className}</td>
                    <td class="occurrences">${usage.occurrences}</td>
                    <td class="files">${usage.files.join('<br>')}</td>
                </tr>
              `
  }).join('')}
        </tbody>
    </table>
    ` : ''}
</body>
</html>
`

  // Ensure the directory exists
  const directory = path.dirname(outputPath)
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }

  // Write the report
  fs.writeFileSync(outputPath, html)
} 
