import { sleep } from './lib/utils'
import { random } from './lib/random'
import type { ServerRequest, ServerResponse, RequestOptions, ClientResponse } from './lib/http'
import { startHTTPServer, makeRequest } from './lib/http-utils'
import { loadAndWatchConfig, type Config } from './config'

export interface MockUtils {
  config: Config
  API: (request?: Partial<RequestOptions>) => Promise<ClientResponse>
  random: typeof random
  sleep: typeof sleep
}

export function startMockServer(configFile: string, watch?: boolean) {
  const config = loadAndWatchConfig(configFile, watch)

  console.log(`Start mock server at ${config.port}`)
  startHTTPServer(config.port, async (...args) => new RequestHandler(config, ...args).handle())
}

class RequestHandler {
  constructor(
    public config: Config,
    public request: ServerRequest,
    public response: ServerResponse
  ) {
    if (!request.path.startsWith(config.base)) {
      throw new Error(`base mismatch "${config.base}" => "${request.path}"`)
    }
  }

  get APIPath() {
    return this.request.path.slice(this.config.base.length)
  }

  get useMock() {
    return this.APIPath in this.config.mocks
  }

  // 用 upstream 的响应结果填充当前 response
  async fetchUpstream(options: Partial<RequestOptions> = {}) {
    const { config, request, APIPath } = this

    if (config.upstream === null) throw new Error('need upstream')
    const upstream =
      typeof config.upstream === 'string' ? config.upstream : config.upstream(request)

    const upstreamRequestOptions = {
      method: request.method,
      url: upstream + APIPath,
      query: request.query,
      headers: request.headers.values,
      body: request.body,
    }

    const clientResponse = await makeRequest({
      ...upstreamRequestOptions,
      ...options,
    })
    this.response.replaceBy(clientResponse)

    // 一般不需读取此值
    return clientResponse
  }

  get utils(): MockUtils {
    return {
      config: this.config,
      API: this.fetchUpstream.bind(this),
      random,
      sleep,
    }
  }

  async handle() {
    const { config, request, response, APIPath, useMock } = this
    const { preprocess, postprocess } = config

    if (preprocess) await preprocess(request, response, this.utils)
    if (useMock) {
      const mockFunction = config.mocks[APIPath]
      await mockFunction!(request, response, this.utils)
    } else {
      await this.fetchUpstream()
    }
    if (postprocess) await postprocess(request, response, this.utils)

    this.formatHeaders()
  }

  formatHeaders() {
    const { response, useMock } = this

    response.headers.set('FFMock-Result', useMock ? 'mocked' : 'upstream')

    // CORS
    if (response.headers.get('Access-Control-Allow-Credentials') !== 'true') {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }
    // CORS - preflight
    response.headers.set('Access-Control-Max-Age', '3600')
    // CORS - 实际请求
    response.headers.set('Access-Control-Expose-Headers', 'FFMock-Result')
  }
}
