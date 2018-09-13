#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const startMockServer = require('./server')


if(process.argv.length !== 3) {
    console.warn('Usage: node run.js configFile')
    process.exit(1)
}

const arg = process.argv[2]

if(arg === '-v' || arg === '--version') {
    const packageJSON = require(path.join(__dirname, '../package.json'))
    console.log(packageJSON.version)
    process.exit(0)
}

const configFile = path.resolve(arg)
if(!fs.existsSync(configFile)) {
    console.warn(`config file "${configFile}" not exists`)
    process.exit(1)
}

try {
    startMockServer(configFile)
} catch(e) {
    console.warn(e.message)
    process.exit(1)
}
