import { spawn } from 'node:child_process'
import process from 'node:process'

const isWindows = process.platform === 'win32'

function spawnCommand(command, args = []) {
  if (isWindows) {
    return spawn([command, ...args].map(quoteWindowsArg).join(' '), {
      stdio: 'inherit',
      shell: true,
      windowsHide: false,
      env: process.env,
    })
  }

  return spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  })
}

function quoteWindowsArg(value) {
  const text = String(value)
  if (!/[\s"]/u.test(text)) return text
  return `"${text.replace(/"/gu, '\\"')}"`
}

const children = [
  spawnCommand(process.execPath, ['examples/tts-provider/server.mjs']),
  spawnCommand('npm', ['run', 'dev']),
]

let exiting = false

function shutdown(code = 0) {
  if (exiting) return
  exiting = true

  for (const child of children) {
    if (!child.killed) child.kill()
  }

  process.exit(code)
}

for (const child of children) {
  child.on('error', (error) => {
    if (!exiting) {
      console.error('[dev:with-tts] child process failed:', error)
      shutdown(1)
    }
  })

  child.on('exit', (code) => {
    if (!exiting && code && code !== 0) {
      shutdown(code)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
