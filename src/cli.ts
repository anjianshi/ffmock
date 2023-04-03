#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import { startMockServer } from './server'

if (process.argv.length !== 3) {
  console.warn('Usage: node run.js configFile')
  process.exit(1)
}

const arg = process.argv[2]!

if (arg === '-v' || arg === '--version') {
  const packageJSON = require(path.join(__dirname, '../package.json')) as Record<
    string,
    string | number
  >
  console.log(packageJSON.version)
  process.exit(0)
}

const configFile = path.resolve(arg)
if (!fs.existsSync(configFile)) {
  console.warn(`config file "${configFile}" not exists`)
  process.exit(1)
}

try {
  startMockServer(configFile)
} catch (e) {
  console.warn((e as Error).message)
  process.exit(1)
}
