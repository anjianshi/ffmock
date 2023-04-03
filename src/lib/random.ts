/**
 * 随机数工具
 */
export const random = {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
  int(min = 0, max = 1000000) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1) + min)
  },

  float(min = 0, max = 1000000) {
    return Math.random() * (max - min) + min
  },

  string(len: number, seed: string) {
    if (!seed)
      seed =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`-=[]\\;\',./~!@#$%^&*()_+{}|:"<>?'
    let result = ''
    while (result.length < len) {
      result += seed[random.int(0, seed.length - 1)]
    }
    return result
  },

  choice<T>(choices: T[]) {
    return choices[random.int(0, choices.length - 1)]
  },
}
