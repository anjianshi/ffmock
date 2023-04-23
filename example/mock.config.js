console.log('mock running')

module.exports = {
  port: 9004,

  upstream(request) {
    return 'https://baidu.com/'
  },

  postprocess(request, response) {
    console.log(`[request][${request.path}]`, JSON.stringify(response.data))
  },

  mocks: {
    async '/test'(request, response, utils) {
      response.data = {
        success: true,
        data: 'hello, world',
      }
    },
  },
}
