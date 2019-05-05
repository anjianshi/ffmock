# FFMock - Fire Frontend Mock Server
前端开发经常要模拟后端接口的返回数据（mock），把 mock 写在前端代码里不够方便、灵活，此工具改为运行一个能返回 mock 数据的 server 来解决此问题。  
前端的请求统一发给此 mock server，对不需要 mock 的接口，它会返回原接口的响应内容，对需要 mock 的则返回 mock 数据。


## 使用方法

### 全局使用
```
sudo npm install -g ffmock
ffmock /path/to/mock.config.js
```

### 项目内使用
安装依赖
```bash
npm install ffmock
```

package.json
```json
{
    "name": "xxx",
    "scripts": {
        "mock": "ffmock /path/to/mock.config.js"
    }
}
```

运行 mock
```bash
npm run mock
```

### config 自动 reload
ffmock 运行起来后，更新 mock config 文件的内容，ffmock 会自动应用最新的 config


## mock config 格式
```javascript
module.exports = {
    // mock server 监听的端口
    port: 9095,

    // 上游 API URL，如 'http://api.map.baidu.com/api'
    upstream: '',

    // mock server 前面架了反向代理（如 Nginx）时需使用
    // 例如 mock server 通过 Nginx 挂载在 http://mydomain.com/my_ffmock
    // 那么 base 需设置成 my_ffmock，以正确判断实际的 API 路径
    base: '',

    // 预处理器。所有请求在发给 mock 函数前都会先由此函数进行一遍处理
    // 与 mock 的函数形式相同
    preprocess: async (request, response, utils) => {},

    // 后处理器。所有请求在结束前都会由此函数再处理一遍
    postprocess: async (request, response, utils) => {},

    // mock 内容
    mocks: {
        // APIPath: mockData||mockFunction

        // 可以直接指定一个数据作为响应结果（输出时会将其 JSON 化）
        api_1: { a: 1, b: 2 },

        /*
        也可以指定一个函数，实现更复杂的行为，例如：
        - 生成与 request 对应的 response
        - 把修改过的 upstream 响应结果作为 response
        - 自定义 HTTP headers、模拟随机的请求失败、模拟网络延迟
        详见下方的 "mockFunction 格式"
        */
        api_2: (request, resopnse, utils) => doSomeThing()

        // 对 mocks 没定义的 API，会返回 upstream 的响应内容
    },
}
```

### mockFunction 格式
```javascript
/*
request     ServerRequest     客户端请求内容
response    ServerResponse    mock 响应内容
utils       {}                一些工具函数

mockFunction 通过修改 response 的属性来设置响应内容（注意，不是通过返回 data 来指定响应内容）,
例如设置 resonse.data 或 response.body。
详见 ServerResponse 格式说明。

若 mock 需要异步执行，可以返回一个 promise（或把 mockFunction 定义成 async 函数）
这样当返回的 promise resolved 时，才执行响应（此 promise 无需 resolve 任何结果）
*/
async function mockFunction(request, response, utils) {
    if(request.query.someFlag) {
        response.data = { success: true }
    } else {
        response.data = { success: false }
    }
    await utils.sleep(3)        // 3 秒后才响应
}
```

### utils 列表
```javascript
{
    // 完整的 mock config 内容
    config,

    /*
    用 upstream 的响应结果填充当前 response
    可通过 options 自定义向 upstream 发起的请求，格式见 ClientRequest 的说明
    注意：这是个异步函数，要使用它，mockFunction 必须也是异步的
    */
    API: async (options) => {},

    // 随机数生成器
    random: {
        int: (min, max) => int,
        float: (min, max) => float,
        string: (len, seed='abcdefg0123456...') => string,
        choice: ([a, b, c]) => item,     // 从数组里随机返回一个 item
    },

    // 生成一个指定秒数后完成的 promise，用于实现异步的 sleep 效果
    sleep: async (seconds) => {},

    // 加载指定 path 的内容；与 require() 的区别在于每次都会重新加载。
    // mock 里需要载入数据文件时很有用，可以保证修改数据文件后新内容立刻生效
    load: absolute_path => content
}
```

### ServerRequest -- 客户端请求内容
```javascript
// 以 URL www.baidu.com:9900/abcde?a=1&b=2#xyz 为例
{
    method,         // GET
    host,           // www.baidu.com:9900
    path,           // /abcde
    query,          // { a: '1', b: '2' }

    // headers 经过特殊处理，读写时无需介意 header name 大小写。
    // 例如用 'content-type' 也能读到 'Content-Type'
    headers,        // Headers({ 'Content-Type': 'xxx' })
    body,           // 请求的原始 body
    data,           // 若 Content-Type 是 json 或 x-www-form-urlencoded 会被解析成 object，否则为 undefined
                    // （JSON 解析失败也为 undefined）
}
```

### ServerResponse -- mock 响应内容
```javascript
{
    status,         // status code，默认 200
    headers,        // Headers()
    body,           // 响应体，字符串形式。可被 data 覆盖
    data,           // 此值不为 undefined 时，会将其 JSON 化作为 body
}
```

### ClientRequest -- utils.API() 的请求内容
构造参数：
```javascript
{
    method,
    url,
    query,         // object, 会作为 query string 补充到 URL 里
    headers,
    body,
    data,          // 若指定，会根据 headers['Content-Type'] 对其格式化（默认 JSON 化）并代替 body
}
```

数据格式：
```javascript
// 以 URL https://www.baidu.com:9900/abcde?a=1&b=2#xyz 为例
{
    method,             // GET
    protocol,           // https:
    host,               // www.baidu.com
    port,               // 9900
    path,               // /abcde
    headers,            // Headers()
    body,
}
```

### ClientResponse -- utils.API() 的返回内容（一般用不到）
```javascript
{
    status,     // status code
    headers,    // Headers()
    body,       // 原始响应体
    data,       // 解析过的响应体。Content-Type 不为 json 或 json 解析失败时为 null
}
```


## mock 使用方式演示

### 修改原接口返回的数据
```javascript
module.exports = {
    upstream: 'xxx',
    mocks: {
        'some_api': async (request, response, utils) => {
            await utils.API()
            response.data.foo = 'bar2'
        }
    }
}

```

### 在多次请求、多个接口之间保留数据
```javascript
// id: value
const APIAData = {}

module.exports = {
    upstream: 'xxx',
    mocks: {
        'api/a/get': (request, response, utils) => {
            const id = request.query.id
            response.data = id in APIAData ? APIAData[id] : null
        },
        'api/a/set': (request, response, utils) => {
            const id = request.query.id
            APIAData[id] = request.query.value || null
        },
    }
}
```

### 定义一个全局的预处理器 (也可用同样的方法定义后处理器)
```javascript
const preprocess = (mockFunction) => {
    return (request, response, utils) => {
        // 进行一些预处理行为
        response.headers['My-Custom-Header'] = 'Custom-Value'

        mockFunction(request, response, utils)
    }
}

module.exports = {
    upstream: 'xxx',
    mocks: {
        // 用 preprocess 包裹原 mockFunction 即可应用此预处理器
        'api/a/get': preprocess((request, response, utils) => {
            // xxx
        })
    }
}
```
