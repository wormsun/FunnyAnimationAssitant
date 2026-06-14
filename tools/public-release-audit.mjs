import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const root = git(['rev-parse', '--show-toplevel'])

function normalize(file) {
  return file.replace(/\\/g, '/')
}

function toAbsolute(file) {
  return path.join(root, file)
}

function listPublicCandidates() {
  const output = git(['ls-files', '--cached', '--others', '--exclude-standard'])
  return output
    .split(/\r?\n/)
    .map((line) => normalize(line.trim()))
    .filter(Boolean)
}

const candidates = listPublicCandidates()
const issues = []

const forbiddenPublicPrefixes = [
  'doc/',
  'doc-prd/',
  'dist/',
  'node_modules/',
  'public/vipcode/',
]

for (const file of candidates) {
  const matchedPrefix = forbiddenPublicPrefixes.find((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix))
  if (matchedPrefix) {
    issues.push(`Forbidden public candidate: ${file} matches ${matchedPrefix}`)
  }
}

const requiredIgnoredPaths = [
  '.env',
  'doc/README.md',
  'doc-prd/README.md',
  'dist/index.html',
  'examples/tts-provider/.env',
  'node_modules/.package-lock.json',
  'public/vipcode/example.txt',
]

for (const ignoredPath of requiredIgnoredPaths) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', ignoredPath], { cwd: root })
  } catch {
    issues.push(`Expected path is not ignored by git: ${ignoredPath}`)
  }
}

const textFileExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.scss',
  '.ts',
  '.tsx',
  '.vue',
  '.yml',
  '.yaml',
])

const secretPatterns = [
  { name: 'private cloud host', pattern: /\b(?:as\.)?aitalk\.cloud\b/i },
  { name: 'vip private asset path', pattern: /public[\\/]+vipcode/i },
  { name: 'Windows local absolute path', pattern: /[A-Za-z]:\\(?:Users|Study|workspace|Downloads|Desktop)\\/ },
  { name: 'OpenAI-style secret key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'Slack token', pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

const maxTextFileSize = 2 * 1024 * 1024
const contentScanExclusions = new Set(['.gitignore', 'tools/public-release-audit.mjs'])

for (const file of candidates) {
  if (contentScanExclusions.has(file)) continue

  const ext = path.extname(file).toLowerCase()
  if (!textFileExtensions.has(ext)) continue

  const absolute = toAbsolute(file)
  const stat = statSync(absolute)
  if (stat.size > maxTextFileSize) continue

  const content = readFileSync(absolute, 'utf8')
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      issues.push(`Potential ${name} found in ${file}`)
    }
  }
}

if (issues.length > 0) {
  console.error('Public release audit failed:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log(`Public release audit passed. Checked ${candidates.length} public candidate files.`)
