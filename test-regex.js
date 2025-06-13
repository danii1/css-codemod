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
