/**
 * 通用工具函数、类型定义
 */

export type JSONData = null | number | string | boolean | JSONData[] | { [key: string]: JSONData }

/**
 * 生成一个若干秒后 resolved 的 promise
 * async 函数内，可以 await sleep(seconds) 实现 sleep 效果
 */
export async function sleep(seconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, seconds * 1000)
  })
}

/**
 * 强制一个字符串以（或不以）斜杠开始/结束
 */
export function formatSlash(string: string, startsWith = false, endsWith = false) {
  if (['', '/', '//'].includes(string)) {
    return startsWith || endsWith ? '/' : ''
  }

  if (!startsWith && string.startsWith('/')) string = string.slice(1)
  if (startsWith && !string.startsWith('/')) string = '/' + string

  if (!endsWith && string.endsWith('/')) string = string.slice(0, -1)
  if (endsWith && !string.endsWith('/')) string = string + '/'

  return string
}

/**
 * 转义正则字符
 * 复制自 lodash: https://github.com/lodash/lodash/blob/master/escapeRegExp.js
 */
const reRegExpChar = /[\\^$.*+?()[\]{}|]/g
const reHasRegExpChar = RegExp(reRegExpChar.source)
export function escapeRegExp(string: string) {
  return string && reHasRegExpChar.test(string)
    ? string.replace(reRegExpChar, '\\$&')
    : string || ''
}
