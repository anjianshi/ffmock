/**
 * 实现 mock config 的读取和重新加载
 */
import fs from 'node:fs'
import { watchRequired } from './lib/listen-require'
import { formatSlash, type JSONData } from './lib/utils'
import { type ServerRequest, type ServerResponse } from './lib/http'
import type { MockUtils } from './server'

/**
 * 预设默认值
 */
const defaults = {
  port: 9095,
}

export type Processor = (
  request: ServerRequest,
  response: ServerResponse,
  utils: MockUtils
) => void | Promise<void>

export interface Config {
  port: number
  upstream: string | ((request: ServerRequest) => string) | null
  base: string // base 为空时前后都不加斜杠
  preprocess: Processor | null
  postprocess: Processor | null
  mocks: {
    [route: string]: Processor
  }
}

type InputConfig = Partial<
  Omit<Config, 'mocks'> & { mocks: { [route: string]: Processor | JSONData } }
>

/**
 * 加载 mock config
 * watch 若为 true，mock config 及其 require() 的文件有更新时，会自动重新加载
 */
export class ConfigManager {
  private _config: Config

  get config() {
    return this._config
  }

  constructor(readonly filepath: string, readonly watch = true) {
    if (watch) this.initialWatch()
    this._config = this.load()
  }

  private initialWatch() {
    watchRequired(() => this.reload())
  }

  /**
   * 重新加载配置文件
   */
  reload() {
    if (!fs.existsSync(this.filepath)) {
      console.warn(`config file "${this.filepath}" not exists`)
      return
    }

    delete require.cache[this.filepath]

    let newConfig: Config
    try {
      newConfig = this.load()
    } catch (e) {
      console.error(`config file load failed: ${(e as Error).message}`)
      return
    }

    for (const key of Object.keys(this._config) as (keyof Config)[]) delete this._config[key]
    Object.assign(this._config, newConfig)

    console.log('config reloaded')
  }

  /**
   * 加载配置文件
   */
  private load() {
    const raw = require(this.filepath) as InputConfig
    return this.format(raw)
  }

  /**
   * 格式化用户提供的 config 内容
   */
  format(raw: InputConfig) {
    // base 和 upstream 在为空时前后都不加斜杠
    const config: Config = {
      port: defaults.port,
      upstream: null,
      base: '',
      preprocess: null,
      postprocess: null,
      mocks: {},
    }

    if (raw.port !== undefined) config.port = raw.port
    if (raw.upstream !== undefined) {
      const origUpstream = raw.upstream
      config.upstream =
        origUpstream === null || origUpstream === ''
          ? null
          : typeof origUpstream === 'string'
          ? formatSlash(origUpstream, false, false)
          : origUpstream
    }
    if (raw.base !== undefined) config.base = formatSlash(raw.base, true, false)
    if (raw.preprocess) config.preprocess = raw.preprocess
    if (raw.postprocess) config.postprocess = raw.postprocess

    if (raw.mocks) {
      for (const key of Object.keys(raw.mocks)) {
        const mock = raw.mocks[key]

        const formattedKey = formatSlash(key, true, false)
        config.mocks[formattedKey] =
          typeof mock === 'function'
            ? mock
            : (request, response) => {
                response.data = mock
              }
      }
    }

    return config
  }
}

export function loadAndWatchConfig(filepath: string, watch = true) {
  const manager = new ConfigManager(filepath, watch)
  return manager.config
}
