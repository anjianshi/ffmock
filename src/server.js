const lib = require('./lib')
const loadAndWatchConfig = require('./config')


module.exports = function startMockServer(rawConfig) {
    const config = loadAndWatchConfig(rawConfig)

    console.log('Start mock server at ' + config.port)
    lib.httpServer(config.port, (...args) => (new RequestHandler(config, ...args)).handle())
}


class RequestHandler {
    constructor(config, request, response) {
        if(!request.path.startsWith(config.base)) {
            throw new Error(`base mismatch "${config.base}" => "${request.path}"`)
        }

        this.config = config
        this.request = request
        this.response = response
    }

    get APIPath() {
        return this.request.path.slice(this.config.base.length)
    }

    get useMock() {
        return this.APIPath in this.config.mocks
    }

    // 用 upstream 的响应结果填充当前 response
    async fetchUpstream(options) {
        const { config, request, APIPath } = this
        const upstreamRequestOptions = {
            method: request.method,
            url: config.upstream + APIPath,
            query: request.query,
            headers: request.headers,
            body: request.body,
        }

        const clientResponse = await lib.request({ ...upstreamRequestOptions, ...options })
        this.response.replaceBy(clientResponse)

        // 一般不需读取此值
        return clientResponse
    }

    get utils() {
        return {
            config: this.config,
            API: this.fetchUpstream.bind(this),
            random: lib.random,
            sleep: lib.sleep,
            load: lib.load,
        }
    }

    async handle() {
        const { config, request, response, APIPath, useMock } = this
        const { preprocess, postprocess } = config

        if(preprocess) await preprocess(request, response, this.utils)
        if(useMock) {
            const mockFunction = config.mocks[APIPath]
            await mockFunction(request, response, this.utils)
        } else {
            await this.fetchUpstream()
        }
        if(postprocess) await postprocess(request, response, this.utils)

        this.formatHeaders()
    }

    formatHeaders() {
        const { response, useMock } = this

        response.headers['FFMock-Result'] = useMock ? 'mocked' : 'upstream'

        // CORS
        response.headers['Access-Control-Allow-Origin'] = '*'
        // CORS - preflight
        response.headers['Access-Control-Max-Age'] = '3600'
        // CORS - 实际请求
        response.headers['Access-Control-Expose-Headers'] = 'FFMock-Result'
    }
}
