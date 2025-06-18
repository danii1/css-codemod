import fs from 'fs'
import path from 'path'

/**
 * Parse gitignore patterns from a .gitignore file
 */
export function parseGitignoreFile(gitignoreFilePath: string): string[] {
  try {
    const content = fs.readFileSync(gitignoreFilePath, 'utf8')
    return content
      .split('\n')
      .map(line => { return line.trim() })
      .filter(line => { return line && !line.startsWith('#') }) // Remove empty lines and comments
      .map(line => {
        // Handle negation patterns (!) by removing the ! for now
        // We'll implement proper negation logic if needed
        return line.startsWith('!') ? line.slice(1) : line
      })
  } catch {
    // .gitignore file doesn't exist or can't be read
    return []
  }
}

/**
 * Check if a path should be ignored based on gitignore patterns
 */
export function shouldIgnorePath(filePath: string, gitignorePatterns: string[], basePath: string): boolean {
  const relativePath = path.relative(basePath, filePath)

  for (const pattern of gitignorePatterns) {
    // Convert gitignore pattern to a more usable format
    let regexPattern = pattern
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\*/g, '.*')   // Convert * to .*
      .replace(/\?/g, '.')    // Convert ? to .

    // Handle directory patterns (ending with /)
    if (pattern.endsWith('/')) {
      regexPattern = regexPattern.slice(0, -1) + '($|/.*)'
    }

    // Handle patterns starting with /
    if (pattern.startsWith('/')) {
      regexPattern = '^' + regexPattern.slice(1)
    } else {
      regexPattern = '(^|/)' + regexPattern
    }

    regexPattern += '($|/.*)'

    try {
      const regex = new RegExp(regexPattern)
      if (regex.test(relativePath)) {
        return true
      }
    } catch {
      // Invalid regex pattern, skip it
      continue
    }
  }

  return false
}

/**
 * Collect all gitignore patterns from the project directory and its subdirectories
 */
export function collectGitignorePatterns(projectDirectory: string): Map<string, string[]> {
  const gitignoreMap = new Map<string, string[]>()

  function collectFromDirectory(dirPath: string): void {
    try {
      const gitignoreFile = path.join(dirPath, '.gitignore')
      if (fs.existsSync(gitignoreFile)) {
        const patterns = parseGitignoreFile(gitignoreFile)
        if (patterns.length > 0) {
          gitignoreMap.set(dirPath, patterns)
        }
      }

      // Recursively check subdirectories, but avoid common ignored directories
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() &&
          !['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
          collectFromDirectory(path.join(dirPath, entry.name))
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  collectFromDirectory(projectDirectory)
  return gitignoreMap
}

/**
 * Check if a path should be ignored based on all applicable gitignore files
 */
export function isPathIgnored(filePath: string, gitignoreMap: Map<string, string[]>): boolean {
  // Check each gitignore file to see if it applies to this path
  for (const [gitignoreDirectory, patterns] of gitignoreMap.entries()) {
    // Only apply gitignore if the file is within or below the gitignore directory
    if (filePath.startsWith(gitignoreDirectory)) {
      if (shouldIgnorePath(filePath, patterns, gitignoreDirectory)) {
        return true
      }
    }
  }
  return false
} 
