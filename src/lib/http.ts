/**
 * 对 HTTP 相关类型的二次封装
 */
import http from 'node:http'
import url from 'node:url'
import zlib from 'node:zlib'
import { JSONData } from './utils'

/**
 * 作为一个 server，接收到的 request
 */
export class ServerRequest {
  method: string
  host: string
  path: string
  query: Record<string, string>
  headers: Headers
  body: string
  data?: JSONData

  constructor(nodeServerRequest: http.IncomingMessage, bodyBuffer: Buffer) {
    const raw = nodeServerRequest
    const headers = new Headers(raw.headers)
    const urlObj = url.parse(raw.url ?? '')

    const body = bodyBuffer.toString('utf-8')
    const contentType = headers.get('Content-Type') ?? ''
    if (contentType.startsWith('application/json') && body) {
      try {
        this.data = JSON.parse(body) as JSONData
      } catch (e) {
        console.error(`ServerRequest body JSON parse failed: ${(e as Error).message}`)
      }
    } else if (contentType.includes('x-www-form-urlencoded')) {
      this.data = Query.parse(body)
    }

    this.method = raw.method ?? ''
    this.host = headers.get('host') ?? ''
    this.path = urlObj.pathname ?? ''
    this.query = Query.parse(urlObj.query ?? '')
    this.headers = headers
    this.body = body
  }
}

/**
 * 作为一个 server，响应的 response
 */
export class ServerResponse {
  status: number
  headers: Headers
  body: string
  data?: JSONData

  constructor(
    options: {
      status?: number
      headers?: Record<string, string | string[]>
      body?: string
      data?: JSONData // 若指定，会 JSON 化并代替 body
    } = {}
  ) {
    this.status = options.status ?? 200
    this.headers = new Headers(options.headers)
    this.body = options.body ?? ''
    this.data = 'data' in options ? options.data : undefined // 此值不为 undefined 时会格式化并覆盖 body
  }

  // 在实际执行响应前调用此方法
  format() {
    // handle data
    if (this.data !== undefined) {
      this.body = JSON.stringify(this.data)
      if (!this.headers.has('Content-Type'))
        this.headers.set('Content-Type', 'application/json; charset=UTF-8')
    }

    // format headers
    this.headers.set('Content-Length', Buffer.byteLength(this.body))

    if (!this.headers.has('Content-Type')) {
      this.headers.set('Content-Type', 'plain-text')
    }
  }

  replaceBy(clientResponse: ClientResponse) {
    this.status = clientResponse.status
    this.headers = clientResponse.headers
    this.body = clientResponse.body
    this.data = clientResponse.data
  }
}

/**
 * 作为一个 client，发起的 request
 */
export interface RequestOptions {
  method?: string
  url: string
  query?: Record<string, string> // 会作为 query string 补充到 url 里
  headers?: Record<string, string | string[]>
  body?: string
  data?: JSONData // 若指定，会根据 headers 里的 'Content-Type' 对其格式化（默认 JSON 化）并代替 body
}

export class ClientRequest {
  method: string
  protocol: string
  host: string
  port: number
  path: string
  body: string
  headers: Headers

  constructor(options: RequestOptions) {
    this.method = options.method ?? 'GET'

    const urlObj = url.parse(options.url)
    this.protocol = urlObj.protocol ?? 'http'
    this.host = urlObj.hostname ?? ''
    this.port =
      urlObj.port !== null ? parseInt(urlObj.port, 10) : urlObj.protocol === 'https:' ? 443 : 80
    this.path = urlObj.path ?? ''

    if (options.query) {
      const prefix = !this.path.includes('?') ? '?' : '&'
      this.path += prefix + Query.stringify(options.query)
    }

    this.headers = new Headers(options.headers)

    if (options.data !== undefined) {
      const contentType = this.headers.get('Content-Type')
      if (contentType === 'x-www-form-urlencoded') {
        this.body = Query.stringify(options.data as unknown as Record<string, string>)
      } else {
        this.body = JSON.stringify(options.data)
        if (contentType !== undefined) this.headers.set('Content-Type', 'application/json')
      }
    } else {
      this.body = options.body ?? ''
    }

    if (!this.headers.has('Content-Length')) {
      this.headers.set('Content-Length', Buffer.byteLength(this.body))
    }
    this.headers.remove('Host')
  }
}

/**
 * 作为一个 client，接收到的 response
 */
export class ClientResponse {
  status: number
  headers: Headers
  body: string
  data?: JSONData

  constructor(nodeClientResponse: http.IncomingMessage, bodyBuffer: Buffer) {
    this.status = nodeClientResponse.statusCode!
    this.headers = new Headers(nodeClientResponse.headers)

    if (this.headers.get('Content-Encoding') === 'gzip') {
      bodyBuffer = zlib.gunzipSync(bodyBuffer)
    }
    this.body = bodyBuffer.toString('utf-8')

    if ((this.headers.get('Content-Type') ?? '').startsWith('application/json') && this.body) {
      try {
        this.data = JSON.parse(this.body) as JSONData
      } catch (e) {
        console.error(`ClientResponse body JSON parse failed: ${(e as Error).message}`)
      }
    }

    // 因为 body 已经经过合并和 gzip 解压，这个 HTTP 头无效了，不应再继续使用
    this.headers.remove('transfer-encoding')
    this.headers.remove('content-encoding')
  }
}

export class Headers {
  values: Record<string, string[]> = {}

  constructor(initial: Record<string, string | string[] | undefined> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      if (value !== undefined) {
        this.values[key] = Array.isArray(value) ? value : [value]
      }
    }
  }

  // 取得 values 中已存在的忽略大小写的此 name 值；
  // 若 values 中尚没有，原样返回传入的 name
  getNameInValues(name: string) {
    for (const _name of Object.keys(this.values)) {
      if (_name.toLowerCase() === name.toLowerCase()) return _name
    }
    return name
  }

  getAll(name: string): string[] | undefined {
    return this.values[this.getNameInValues(name)]
  }

  get(name: string) {
    return this.getAll(name)?.[0]
  }

  has(name: string) {
    return this.get(name) !== undefined
  }

  set(name: string, value: string | number | string[]) {
    this.values[this.getNameInValues(name)] = Array.isArray(value) ? value : [value.toString()]
  }

  append(name: string, value: string | number) {
    const prev = this.get(name) ?? []
    this.set(name, [...prev, value.toString()])
  }

  remove(name: string) {
    delete this.values[this.getNameInValues(name)]
  }
}

/**
 * 封装对 query 的读写
 */
export const Query = {
  parse(queryString: string) {
    if (!queryString) return {}

    const query: Record<string, string> = {}
    queryString.split('&').forEach(item => {
      const [key, value] = item.split('=')
      query[key!] = decodeURIComponent(value ?? '')
    })
    return query
  },

  stringify(query: Record<string, string>) {
    return typeof query === 'string'
      ? query
      : Object.keys(query)
          .map(key => key + '=' + encodeURIComponent(query[key!]!))
          .join('&')
  },
}
