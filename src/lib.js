const http = require('http')
const https = require('https')
const url = require('url')
const zlib = require('zlib')


// handler(serverRequest, serverResponse) => undefined || promise => undefined
function httpServer(port, handler) {
    const server = http.createServer((nodeServerRequest, nodeServerResponse) => {
        let bodyBuf = Buffer.from('')
        nodeServerRequest.on('data', chunk => bodyBuf = Buffer.concat([bodyBuf, chunk]))
        nodeServerRequest.on('end', async () => {
            const serverRequest = new ServerRequest(nodeServerRequest, bodyBuf)
            const serverResponse = new ServerResponse()
            await handler(serverRequest, serverResponse)
            serverResponse.format()

            nodeServerResponse.statusCode = serverResponse.status
            for(const key of Object.keys(serverResponse.headers)) {
                nodeServerResponse.setHeader(key, serverResponse.headers[key])
            }

            nodeServerResponse.end(serverResponse.body)
        })
    })
    server.listen(port)
}


// request() => promise => ClientResponse
function request(requestOptions) {
    return new Promise(resolve => {
        const request = new ClientRequest(requestOptions)
        const httpLib = request.protocol === 'https:' ? https : http

        const nodeRequestOptions = {
            method: request.method,
            host: request.host,
            port: request.port,
            path: request.path,
            headers: request.headers
        }

        const nodeClientRequest = httpLib.request(nodeRequestOptions, nodeClientResponse => {
            let bodyBuf = Buffer.from('')
            nodeClientResponse.on('data', chunk => bodyBuf = Buffer.concat([bodyBuf, chunk]))
            nodeClientResponse.on('end', () => resolve(new ClientResponse(nodeClientResponse, bodyBuf)))
        })
        nodeClientRequest.on('error', e => console.error('problem with request: ' + e.message))
        nodeClientRequest.write(request.body)
        nodeClientRequest.end()
    })
}


// 作为一个 server，接收到的 request
class ServerRequest {
    constructor(nodeServerRequest, bodyBuffer) {
        const r = nodeServerRequest
        const headers = new Headers(r.headers)
        const urlObj = url.parse(r.url)

        const body = bodyBuffer.toString('utf-8')
        let data
        const contentType = headers['Content-Type'] || ''
        if(contentType.startsWith('application/json') && body) {
            try {
                data = JSON.parse(body)
            } catch(e) {
                console.error('ServerRequest body JSON parse failed:' + e.message)
            }
        } else if(contentType.indexOf('x-www-form-urlencoded') !== -1) {
            data = Query.parse(body)
        }

        this.method = r.method
        this.host = headers['host']
        this.path = urlObj.pathname
        this.query = Query.parse(urlObj.query)
        this.headers = headers
        this.body = body
        this.data = data
    }
}

/*
作为一个 server，响应的 response

options:        设置 reponse 初始值
    status
    headers
    body
    data        若指定，会 JSON 化并代替 body
*/
class ServerResponse {
    constructor(options={}) {
        this.status = options.status || 200
        this.headers = new Headers(options.headers || {})
        this.body = options.body || ''
        this.data = 'data' in options ? options.data : undefined       // 此值不为 undefined 时会格式化并覆盖 body
    }

    // 在实际执行响应前调用此方法
    format() {
        // handle data
        if(this.data !== undefined) {
            this.body = JSON.stringify(this.data)
            if(!this.headers['Content-Type']) this.headers['Content-Type'] = 'application/json'
        }

        // format headers
        this.headers['Content-Length'] = Buffer.byteLength(this.body)

        if(!('Content-Type' in this.headers)) {
            this.headers['Content-Type'] = 'plain-text'
        }
    }

    replaceBy(clientResponse) {
        this.status = clientResponse.status
        this.headers = clientResponse.headers
        this.body = clientResponse.body
        this.data = clientResponse.data
    }
}

/*
作为一个 client，发起的 request

options:
    method
    url
    query      会作为 queryString 补充到 url 里
    headers
    body
    data       若指定，会根据 headers['Content-Type'] 对其格式化（默认 JSON 化）并代替 body
}
*/
class ClientRequest {
    constructor(options) {
        this.method = options.method || 'GET'

        const urlObj = url.parse(options.url)
        this.protocol = urlObj.protocol
        this.host = urlObj.hostname
        this.port = urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)
        this.path = urlObj.path

        if(options.query) {
            const prefix = this.path.indexOf('?') === -1 ? '?' : '&'
            this.path += prefix + Query.stringify(options.query)
        }

        this.headers = new Headers(options.headers || {})

        if(options.data !== undefined) {
            const contentType = this.headers['Content-Type']
            if(contentType === 'x-www-form-urlencoded') {
                this.body = Query.stringify(this.data)
            } else {
                this.body = JSON.stringify(this.data)
                if(!contentType) this.headers['Content-Type'] = 'application/json'
            }
        } else {
            this.body = options.body || ''
        }

        if(!('Content-Length' in this.headers)) {
            this.headers['Content-Length'] = Buffer.byteLength(this.body)
        }
        delete this.headers['Host']
    }
}

// 作为一个 client，接收到的 response
class ClientResponse {
    constructor(nodeClientResponse, bodyBuffer) {
        this.status = nodeClientResponse.statusCode
        this.headers = new Headers(nodeClientResponse.headers)

        if(this.headers['Content-Encoding'] === 'gzip') {
            bodyBuffer = zlib.gunzipSync(bodyBuffer)
        }
        this.body = bodyBuffer.toString('utf-8')

        if(this.headers['Content-Type'] && this.headers['Content-Type'].startsWith('application/json') && this.data) {
            try {
                this.data = JSON.parse(this.body)
            } catch(e) {
                console.error('ClientResponse body JSON parse failed:' + e.message)
            }
        }

        // 因为 body 已经经过合并和 gzip 解压，这个 HTTP 头无效了，不应再继续使用
        delete this.headers['transfer-encoding']
        delete this.headers['content-encoding']
    }
}

function Headers(raw) {
    raw = {...raw}
    function getRealName(name) {
        if(typeof name !== 'string') return undefined

        for(const key of Object.keys(raw)) {
            if(key.toLowerCase() === name.toLowerCase()) return key
        }
        return undefined
    }
    return new Proxy(raw, {
        get: (target, key) => raw[getRealName(key)],
        set: (target, key, value) => {
            raw[getRealName(key) || key] = value
            return true
        },
        has: (target, key) => getRealName(key) !== undefined,
        deleteProperty: (target, key) => {
            delete raw[getRealName(key)]
            return true
        },
        ownKeys: () => Object.keys(raw)
    })
}

const Query = {
    parse: queryString => {
        if(!queryString) return {}

        const query = {}
        queryString.split('&').forEach(item => {
            const [key, value] = item.split('=')
            query[key] = value
        })
        return query
    },
    stringify: query => typeof query === 'string'
        ? query
        : Object.keys(query).map(key => key + '=' + query[key]).join('&')
}


// 强制一个字符串以（或不以）斜杠开始/结束
function formatSlash(string, startsWith, endsWith) {
    if(['', '/', '//'].indexOf(string) !== -1) {
        return startsWith || endsWith ? '/' : ''
    }

    if(!startsWith && string[0] === '/') string = string.slice(1)
    if(startsWith && string[0] !== '/') string = '/' + string

    if(!endsWith && string[string.length - 1] === '/') string = string.slice(0, -1)
    if(endsWith && string[string.length - 1] !== '/') string = string + '/'

    return string
}


const random = {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    int: (min=0, max=1000000) => {
        min = Math.ceil(min)
        max = Math.floor(max)
        return Math.floor(Math.random() * (max - min + 1) + min)
    },
    float: (min=0, max=1000000) => Math.random() * (max - min) + min,
    string: (len, seed) => {
        if(!seed) seed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`-=[]\\;\',./~!@#$%^&*()_+{}|:"<>?'
        let result = ''
        while(result.length < len) {
            result += seed[random.int(0, seed.length - 1)]
        }
        return result
    },
    choice: choices => choices[random.int(0, choices.length - 1)]
}


// 生成一个若干秒后 resolved 的 promise
// async 函数内，可以 await sleep(seconds) 实现 sleep 效果
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}


// require() 一个文件，且保证每次加载都是重新加载最新的内容
function load(path) {
    delete require.cache[require.resolve(path)]
    return require(path)
}


module.exports = {
    httpServer,
    request,
    ClientRequest,
    ClientResponse,
    ServerRequest,
    ServerResponse,
    formatSlash,
    random,
    sleep,
    load,
}
