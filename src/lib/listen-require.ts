import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'

/**
 * filepath: 经过解析的文件路径（如果是内置模块，则是模块名）
 * moduleId: require() 时传入的原始值
 */
export type RequireListener = (filepath: string, moduleId: string) => void

/**
 * ListenRequire.register() 的快捷函数版本
 */
export function listenRequire(listener: RequireListener, sourceOnly = true) {
  ListenRequire.register(listener, sourceOnly)
}

export class ListenRequire {
  private static listeners: { listener: RequireListener; sourceOnly: boolean }[] = []

  /**
   * 每当引入文件时，触发回调
   * 若 sourceOnly 为 true，忽略内置模块和 node_modules
   */
  static register(listener: RequireListener, sourceOnly = true) {
    ListenRequire.listeners.push({ listener, sourceOnly })
    ListenRequire.hookRequire()
  }

  /**
   * 替换原始的 require() 函数，以实现监听
   */
  private static originalRequire: typeof Module.prototype.require | undefined
  private static hookRequire() {
    if (ListenRequire.originalRequire) return
    ListenRequire.originalRequire = Module.prototype.require
    Module.prototype.require = new Proxy(ListenRequire.originalRequire, {
      apply(target, thisArg: NodeModule, args: [string]) {
        const requireModuleId = args[0]
        ListenRequire.notify(requireModuleId, thisArg)
        return Reflect.apply(target, thisArg, args)
      },
    })
    console.log('Require Hooked.')
  }

  /**
   * 通知各 listerner
   * moduleId: 引入模块的路径（未经解析的）
   * byModule: 由哪个脚本引入的
   */
  private static notify(requireModuleId: string, byModule: NodeModule) {
    if (!ListenRequire.listeners.length) return

    const requireFilepath = ListenRequire.resolveRequireFilepath(requireModuleId, byModule)
    if (requireFilepath === null) return // 解析不到文件，无需通知

    const isSource =
      !Module.isBuiltin(requireModuleId) &&
      requireFilepath &&
      !requireFilepath.includes('node_modules')

    // 如果所有 listener 都是 source only 的，那对于不是 isSource 的文件，可直接跳过通知。
    const allSourceOnly = ListenRequire.listeners.every(item => item.sourceOnly)
    if (allSourceOnly && !isSource) return

    for (const { listener, sourceOnly } of ListenRequire.listeners) {
      if (sourceOnly && !isSource) continue
      listener(requireFilepath, requireModuleId)
    }
  }

  private static resolveRequireFilepath(requireModuleId: string, byModule: NodeModule) {
    if (Module.isBuiltin(requireModuleId)) return requireModuleId // 内置模块原样返回

    const moduleRequire = ListenRequire.getModuleRequire(byModule)
    try {
      return moduleRequire.resolve(requireModuleId)
    } catch (e) {
      return null // 解析不到文件，返回 null
    }
  }

  /**
   * 返回以指定 module 为上下文的 require() 函数（这样执行 require.resolve() 时才是以它为基准来计算相对路径的）
   */
  private static moduleRequireMap = new WeakMap<NodeModule, NodeRequire>()
  private static getModuleRequire(module: NodeModule) {
    if (!ListenRequire.moduleRequireMap.has(module)) {
      const moduleRequire = Module.createRequire(module.filename)
      ListenRequire.moduleRequireMap.set(module, moduleRequire)
    }
    return ListenRequire.moduleRequireMap.get(module)!
  }
}

/**
 * 监听 require() 进来的文件（不含内置模块和 node_modules）
 * 任意文件有变化时，触发回调
 */
export function watchRequired(onUpdate: (filepath: string) => void) {
  const timeoutMap = new Map<string, NodeJS.Timeout>()
  function handleUpdate(filepath: string) {
    clearTimeout(timeoutMap.get(filepath))
    // 编辑器保存文件时，可能会先保存一个空文件再写入实际内容，这之间有个延迟。
    // 所以稍等一下再实际处理，以避免重复处理，以及避免读出空文件。
    const timeoutId = setTimeout(() => {
      console.log('Detected update: ' + filepath)
      onUpdate(filepath)
    }, 500)
    timeoutMap.set(filepath, timeoutId)
  }

  const files = new Set<string>()
  listenRequire(filepath => {
    if (!files.has(filepath)) {
      files.add(filepath)
      console.log('Watching: ' + filepath)
      fs.watch(filepath, () => handleUpdate(filepath))
    }
  })
}
