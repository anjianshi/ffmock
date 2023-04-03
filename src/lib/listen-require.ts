import fs from 'node:fs'
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
  }

  /**
   * 通知各 listerner
   * moduleId: 引入模块的路径（未经解析的）
   * byModule: 由哪个脚本引入的
   */
  private static notify(requireModuleId: string, byModule: NodeModule) {
    if (!ListenRequire.listeners.length) return

    const isSource =
      // 不是内置模块
      !Module.isBuiltin(requireModuleId) &&
      // 执行引入的模块不是 node_modules
      !byModule.filename.includes('node_modules') &&
      // 以 ./ 或 ../ 为开头引入（若不以此开头，可能是引用 node_modules 库）
      requireModuleId.startsWith('.') &&
      // 被引入的路径里不包含 node_modules，避免直接通过路径引入 node_modules 脚本
      !requireModuleId.includes('node_modules')

    // 如果所有 listener 都是 source only 的，那对于不是 isSource 的文件，可直接跳过通知。
    const allSourceOnly = ListenRequire.listeners.every(item => item.sourceOnly)
    if (allSourceOnly && !isSource) return

    const moduleRequire = ListenRequire.getModuleRequire(byModule)
    const requireFilepath = ListenRequire.safeResolve(moduleRequire, requireModuleId)
    if (requireFilepath === null) return // 解析不到文件，无需通知

    for (const { listener, sourceOnly } of ListenRequire.listeners) {
      if (sourceOnly && !isSource) continue
      listener(requireFilepath, requireModuleId)
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

  /**
   * 尝试获取模块绝对路径，若文件不存在，返回 null
   */
  private static safeResolve(require: NodeRequire, moduleId: string) {
    try {
      return require.resolve(moduleId)
    } catch (e) {
      return null
    }
  }
}

/**
 * 监听 require() 进来的文件（不含内置模块和 node_modules）
 * 任意文件有变化时，触发回调
 */
export function watchRequired(onUpdate: (filepath: string) => void) {
  const files = new Set<string>()
  listenRequire(filepath => {
    if (!files.has(filepath)) {
      files.add(filepath)
      fs.watch(filepath, () => onUpdate(filepath))
    }
  })
}
