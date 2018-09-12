#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const startMockServer = require('./server')


if(process.argv.length !== 3) {
    console.warn('Usage: node run.js configFile')
    process.exit(1)
}

const configFile = path.resolve(process.argv[2])
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
