import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import axios from 'axios'
import { api, getHealth } from '../src/lib/api.js'

let server, client
let responseStatus = 200
let responseBody = { status: 'ok', service: '3d-reconstruction-api' }
let delay = 0
let receivedPath

before(async () => {
  server = createServer((request, response) => {
    receivedPath = request.url
    setTimeout(() => {
      response.writeHead(responseStatus, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(responseBody))
    }, delay)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  client = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}`, timeout: 1000 })
})
after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))

test('Axios reaches the versioned health path and accepts the expected service', async () => {
  const result = await getHealth(undefined, client)
  assert.deepEqual(result, responseBody)
  assert.equal(receivedPath, '/api/v1/health')
  assert.equal(api.defaults.timeout, 5000)
})

test('HTTP failures are rejected', async () => {
  responseStatus = 503
  await assert.rejects(getHealth(undefined, client), (error) => error.response.status === 503)
  responseStatus = 200
})

test('wrong service and malformed health payloads are rejected', async () => {
  for (const value of [null, {}, 'not JSON health', { status: 'ok', service: 'another-service' }]) {
    responseBody = value
    await assert.rejects(getHealth(undefined, client), /unexpected/)
  }
  responseBody = { status: 'ok', service: '3d-reconstruction-api' }
})

test('an Axios timeout is rejected and a later retry can recover', async () => {
  delay = 80
  const impatient = axios.create({ baseURL: client.defaults.baseURL, timeout: 10 })
  await assert.rejects(getHealth(undefined, impatient), (error) => error.code === 'ECONNABORTED')
  delay = 0
  assert.equal((await getHealth(undefined, client)).status, 'ok')
})

test('aborted requests are cancelled', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(getHealth(controller.signal, client), (error) => axios.isCancel(error))
})

test('network failures are rejected', async () => {
  const unavailable = axios.create({ adapter: async () => { throw new axios.AxiosError('Network unavailable', 'ERR_NETWORK') } })
  await assert.rejects(getHealth(undefined, unavailable), { code: 'ERR_NETWORK' })
})
