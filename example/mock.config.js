/* eslint-env node */
module.exports = {
  port: 9004,
  upstream: '',
  preproces: async (request, resonse, utils) => {
    console.log(request)
  }
}
