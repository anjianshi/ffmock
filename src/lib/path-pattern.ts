import { formatSlash, escapeRegExp } from './utils'

// 把带通配符的路径转换成正则表达式
// 支持两种通配符：
// - 结尾的 /* 例如 /abc/*
// - 任意位置的 /:xxx 例如 /abc/:xyz/def
// 若字符串带有通配符，返回正则表达式；否则返回普通字符串
export function path2pattern(path: string) {
  if (!path.endsWith('/*') && !path.endsWith('/*/') && !path.includes('/:')) return path

  let raw = formatSlash(path, true, false) // 去掉末尾 /，以便补充正则形式的末尾
  let suffix = ''
  if (raw.endsWith('/*')) {
    raw = raw.slice(0, -2)
    suffix = '/.*$'
  } else {
    suffix = '/?$'
  }

  if (raw.length) {
    raw = raw
      .split('/')
      .map(part => (part.startsWith(':') ? '[^/]+' : escapeRegExp(part)))
      .join('/')
  }

  return new RegExp('^' + raw + suffix)
}
