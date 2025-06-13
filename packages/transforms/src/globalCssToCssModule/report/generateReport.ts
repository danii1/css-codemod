import fs from 'fs'
import path from 'path'

interface ClassUsage {
  className: string
  occurrences: number
  files: string[]
}

export function generateReport(
  classUsages: ClassUsage[],
  outputPath: string
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
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
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
    </style>
</head>
<body>
    <h1>CSS Classes Preventing Conversion Report</h1>
    <p>This report shows classes that prevent conversion to CSS modules, sorted by number of occurrences.</p>
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
