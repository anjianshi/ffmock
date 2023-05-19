/**
 * HTTP 工具函数
 */
import http, {
  type IncomingMessage as NodeServerRequest,
  type ServerResponse as NodeServerResponse,
} from 'node:http'
import https from 'node:https'
import {
  ServerRequest,
  ServerResponse,
  type RequestOptions,
  ClientResponse,
  ClientRequest,
} from './http'

/**
 * 启动一个 HTTP Server
 */
export function startHTTPServer(
  port: number,
  handler: (
    serverRequest: ServerRequest,
    serverResponse: ServerResponse
  ) => undefined | Promise<void>
) {
  const server = http.createServer(handleNodeRequest.bind(null, handler))
  server.listen(port)
}

/**
 * 把 Node.js 原生请求内容转为 FFMock 整理过的格式，并交给 handler 来处理。
 */
export async function handleNodeRequest(
  handler: (
    serverRequest: ServerRequest,
    serverResponse: ServerResponse
  ) => undefined | Promise<void>,
  nodeServerRequest: NodeServerRequest,
  nodeServerResponse: NodeServerResponse
) {
  let bodyBuf = Buffer.from('')
  nodeServerRequest.on('data', chunk => {
    bodyBuf = Buffer.concat([bodyBuf, chunk])
  })
  nodeServerRequest.on('end', async () => {
    const serverRequest = new ServerRequest(nodeServerRequest, bodyBuf)
    const serverResponse = new ServerResponse()
    await handler(serverRequest, serverResponse)
    serverResponse.format()

    nodeServerResponse.statusCode = serverResponse.status
    for (const key of Object.keys(serverResponse.headers.values)) {
      const value = serverResponse.headers.getAll(key)
      if (value !== undefined) nodeServerResponse.setHeader(key, value)
    }

    nodeServerResponse.end(serverResponse.body)
  })
}

/**
 * 发起请求
 */
export async function makeRequest(requestOptions: RequestOptions) {
  return new Promise<ClientResponse>(resolve => {
    const request = new ClientRequest(requestOptions)
    const httpLib = request.protocol === 'https:' ? https : http

    const nodeRequestOptions = {
      method: request.method,
      host: request.host,
      port: request.port,
      path: request.path,
      headers: request.headers.values,
    }

    const nodeClientRequest = httpLib.request(nodeRequestOptions, nodeClientResponse => {
      let bodyBuf = Buffer.from('')
      nodeClientResponse.on('data', chunk => {
        bodyBuf = Buffer.concat([bodyBuf, chunk])
      })
      nodeClientResponse.on('end', () => {
        resolve(new ClientResponse(nodeClientResponse, bodyBuf))
      })
    })
    nodeClientRequest.on('error', e => console.error('problem with request: ' + e.message))
    nodeClientRequest.write(request.body)
    nodeClientRequest.end()
  })
}
