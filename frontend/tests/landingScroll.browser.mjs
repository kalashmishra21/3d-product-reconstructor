import assert from 'node:assert/strict'

const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173'
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  message.error ? reject(new Error(message.error.message)) : resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const callId = ++id
  pending.set(callId, { resolve, reject })
  socket.send(JSON.stringify({ id: callId, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: origin })
  for (let attempt = 0; attempt < 100 && !(await evaluate("!!document.querySelector('.p-hero h1')")); attempt += 1) await pause(100)
  for (const theme of ['forest', 'ivory']) {
    if (await evaluate('document.documentElement.dataset.theme') !== theme) {
      await evaluate("document.querySelector('.theme-toggle').click()")
      await pause(150)
    }
    for (const width of [1440, 1024, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 844 : 900, deviceScaleFactor: 1, mobile: false })
      await evaluate('window.scrollTo(0, 200)')
      await pause(100)
      const state = await evaluate(`(() => {
        const header = document.querySelector('.site-header--landing')
        const headline = document.querySelector('.p-hero h1')
        const h = header.getBoundingClientRect()
        const title = headline.getBoundingClientRect()
        const shell = getComputedStyle(header)
        const backing = getComputedStyle(header, '::before')
        const shellAlpha = shell.backgroundColor.startsWith('rgba(') ? Number(shell.backgroundColor.split(',').at(-1).replace(')', '').trim()) : 1
        const backingAlpha = backing.backgroundColor.startsWith('rgba(') ? Number(backing.backgroundColor.split(',').at(-1).replace(')', '').trim()) : 1
        return { overlap: title.top < h.bottom && title.bottom > h.top, shellAlpha, backingAlpha,
          backingCoversHeader: backing.content !== 'none' && backing.position === 'absolute' && backing.inset === '0px',
          scrollY: window.scrollY }
      })()`)
      assert.ok(state.overlap, `${theme} ${width}px reproduces the scrolling headline passing under the sticky header`)
      assert.equal(state.shellAlpha, 0, `${theme} ${width}px keep the header shell transparent for the water-glass capsule`)
      assert.equal(state.backingAlpha, 1, `${theme} ${width}px backing must hide scrolling headline behind the header`)
      assert.ok(state.backingCoversHeader, `${theme} ${width}px backing must cover the full sticky header`)
    }
  }
  console.log('PASS landing header keeps scrolling hero content visually separated in both themes and all requested widths')
} finally {
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`)
}
