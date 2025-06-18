function escapeRegExp(string) {
  return string.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
}

const className = 'Loading'

// Test cases
const testCases = [
  // Should NOT match
  'className="AddOnsConfirmModal--Loading"',
  'className="btn-Loading-state"',
  'className="Loading-spinner"',
  'className="spinner-Loading"',
  // Should match
  'className="Loading"',
  'className="Loading active"',
  'className="active Loading"',
  'className="active Loading disabled"',
]

// Final correct pattern
const finalPattern = new RegExp(`className=["'](?:[^"']*\\s)?${escapeRegExp(className)}(?:\\s[^"']*)?["']`, 'g')

console.log('Testing FINAL pattern for className:', className)
console.log('Pattern:', finalPattern.toString())
console.log()

testCases.forEach(testCase => {
  finalPattern.lastIndex = 0
  const matches = finalPattern.test(testCase)
  console.log(`${matches ? 'MATCH' : 'NO MATCH'}: ${testCase}`)
})

// Test template literals too
console.log('\n--- Testing template literals ---')
const templateCases = [
  'className={`AddOnsConfirmModal--Loading active`}',
  'className={`Loading`}',
  'className={`Loading active`}',
  'className={`active Loading`}',
]

const templatePattern = new RegExp(
  `className=\\{[\`](?:[^\`]*\\s)?${escapeRegExp(className)}(?:\\s[^\`]*)?[\`]\\}`,
  'g'
)
console.log('Template pattern:', templatePattern.toString())

templateCases.forEach(testCase => {
  templatePattern.lastIndex = 0
  const matches = templatePattern.test(testCase)
  console.log(`${matches ? 'MATCH' : 'NO MATCH'}: ${testCase}`)
})
