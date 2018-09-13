const lib = require('./lib')
const loadAndWatchConfig = require('./config')


module.exports = function startMockServer(rawConfig) {
    const config = loadAndWatchConfig(rawConfig)

    console.log('Start mock server at ' + config.port)
    lib.httpServer(config.port, (...args) => handleRequest(config, ...args))
}


async function handleRequest(config, request, response) {
    if(!request.path.startsWith(config.base)) {
        throw new Error(`base mismatch "${config.base}" => "${request.path}"`)
    }
    const APIPath = request.path.slice(config.base.length)

    const upstreamRequestOptions = {
        method: request.method,
        url: config.upstream + APIPath,
        query: request.query,
        headers: request.headers,
        body: request.body,
    }

    const useMock = APIPath in config.mocks

    if(useMock) {
        const mockFunction = config.mocks[APIPath]
        const utils = {
            config: config,
            API: options => lib.request({ ...upstreamRequestOptions, ...options }),
            random: lib.random,
            sleep: lib.sleep,
        }
        // mockFunction 返回 promise 或没有返回，这句代码都能正常执行
        await mockFunction(request, response, utils)
    } else {
        const clientResponse = await lib.request(upstreamRequestOptions)
        response.replaceBy(clientResponse)
    }

    response.headers['FFMock-Result'] = useMock ? 'mocked' : 'upstream'

    // CORS
    response.headers['Access-Control-Allow-Origin'] = '*'
    // CORS - preflight
    response.headers['Access-Control-Max-Age'] = '3600'
    // CORS - 实际请求
    response.headers['Access-Control-Expose-Headers'] = 'FFMock-Result'
}
