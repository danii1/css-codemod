const cssContent = `
.btn { padding: 0.375rem 0.75rem; }
.btn-primary { background: blue; }
.d-flex { display: flex; }
.text-primary { color: #007bff; }
:global(.global-class) { color: red; }
`

const classRegex = /(?<!:global\()(?:^|[\s+,>~])\.([\w-]+)(?=[\s#+,.:>[{~]|$)/gm
let match
const classNames = new Set()

while ((match = classRegex.exec(cssContent)) !== null) {
  classNames.add(match[1])
}

console.log('Found classes:', [...classNames])

// Test script for class name regex patterns

function escapeRegExp(string) {
  return string.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
}

/**
 * Create a flexible pattern that matches any className utility identifier
 * This matches common patterns: cn, classNames, clsx, cx, etc.
 */
function createClassNameUtilityPattern(className) {
  const escapedClassName = escapeRegExp(className)
  // Pattern that matches common className utility naming patterns
  const identifierPattern = '(?:cn|classnames|clsx|cx)'
  return new RegExp(`${identifierPattern}\\([^)]*["'\`]${escapedClassName}["'\`][^)]*\\)`, 'gi')
}

function testClassNamePatterns(className, testStrings) {
  console.log(`\n=== Testing patterns for className: "${className}" ===`)

  // Updated patterns with flexible className utility detection
  const patterns = [
    // CSS selector: .className (must be followed by CSS delimiter or end of line)
    new RegExp(`\\.${escapeRegExp(className)}(?=[\\s#+,.:>[{~]|$)`, 'g'),
    // TSX className: className="...className..." or className='...className...'
    // Use proper class name boundaries (whitespace, start/end of string)
    new RegExp(`className=["'][^"']*(?:^|\\s)${escapeRegExp(className)}(?:\\s|$)[^"']*["']`, 'g'),
    // Template literal: className={\`...className...\`}
    // Use proper class name boundaries (whitespace, start/end of string)
    new RegExp(`className=\\{[\`][^\`]*(?:^|\\s)${escapeRegExp(className)}(?:\\s|$)[^\`]*[\`]\\}`, 'g'),
    // Flexible className utility pattern: matches cn, classNames, clsx, cx, etc.
    createClassNameUtilityPattern(className),
  ]

  const patternNames = ['CSS selector', 'TSX className', 'Template literal', 'Flexible className utility']

  testStrings.forEach(testString => {
    console.log(`\nTesting: ${testString}`)
    patterns.forEach((pattern, index) => {
      const match = pattern.test(testString)
      pattern.lastIndex = 0 // Reset regex state
      console.log(`  ${patternNames[index]}: ${match ? 'MATCH' : 'no match'}`)
    })
  })
}

// Test cases - now including different className utility names
const testStrings = [
  // Should NOT match "Loading"
  'className="AddOnsConfirmModal--Loading"',
  'className="btn-Loading-state"',
  'className="Loading-spinner"',
  'className="spinner-Loading"',
  'className={`AddOnsConfirmModal--Loading active`}',

  // Should match "Loading"
  'className="Loading"',
  'className="Loading active"',
  'className="active Loading"',
  'className="active Loading disabled"',
  'className={`Loading`}',
  'className={`Loading active`}',
  'className={`active Loading`}',

  // Different className utility functions - should all match
  'classNames("Loading", "active")',
  'cn("Loading", "active")',
  'clsx("Loading", "active")',
  'cx("Loading", "active")',

  // CSS selectors - should NOT match
  '.AddOnsConfirmModal--Loading { color: red; }',
  '.btn-Loading-state:hover { opacity: 0.8; }',

  // CSS selectors - should match
  '.Loading { display: block; }',
  '.Loading:hover { opacity: 0.8; }',
  '.Loading, .active { display: block; }',
]

testClassNamePatterns('Loading', testStrings)
