const fs = require('fs')
const { formatSlash } = require('./lib')


module.exports = function loadAndWatchConfig(configFile) {
    const config = loadConfig(configFile)
    const execReload = () => reload(config, configFile)
    // 编辑器保存 config 文件时，可能会先保存一个空文件再写入实际内容，这之间有个延迟，要稍等一下再 reload config。
    // 不然可能会读出一个空文件来
    fs.watch(configFile, () => setTimeout(execReload, 500))
    return config
}

function reload(config, configFile) {
    if(!fs.existsSync(configFile)) {
        console.warn(`config file "${configFile}" not exists`)
        return
    }

    delete require.cache[configFile]

    try {
        var newConfig = loadConfig(configFile)
    } catch(e) {
        console.error('config file load failed: ' + e.message)
        return
    }

    for(const key of Object.keys(config)) delete config[key]
    Object.assign(config, newConfig)

    console.log('config reloaded')
}

function loadConfig(configFile) {
    const rawConfig = require(configFile)
    return formatConfig(rawConfig)
}

/*
验证并格式化 config

若通过验证，返回 [true, config]
否则返回 [false, message]
*/
function formatConfig(raw) {
    const config = {
        port: 9095,
        base: '',       // base 为空时前后都不加斜杠
        mocks: {}
    }

    if(raw.port) config.port = parseInt(raw.port)

    if(!raw.upstream) throw new Error('请指定 upstream')
    config.upstream = formatSlash(raw.upstream, false, false)

    if(raw.base) config.base = formatSlash(raw.base, true, false)

    if(raw.mocks) {
        for(const key of Object.keys(raw.mocks)) {
            const mock = raw.mocks[key]

            const formattedKey = formatSlash(key, true, false)
            config.mocks[formattedKey] = typeof mock === 'function'
                ? mock
                : (request, response) => { response.data = mock }
        }
    }

    return config
}
