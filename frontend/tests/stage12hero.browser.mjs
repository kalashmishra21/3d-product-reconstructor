import assert from 'node:assert/strict'

const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173'
const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
const appErrors = []
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(message.error.message)) : resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') appErrors.push(message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    appErrors.push((message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' '))
  }
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
const until = async expression => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}
const canvasImage = async () => {
  const bounds = await evaluate(`(() => {
    const r = document.querySelector('.p-hero-canvas').getBoundingClientRect()
    return { x:r.x, y:r.y, width:r.width, height:r.height }
  })()`)
  return (await send('Page.captureScreenshot', { format: 'png', clip: { ...bounds, scale: 1 }, captureBeyondViewport: true })).data
}
const setTopology = async value => {
  await evaluate(`(() => {
    const input = document.querySelector('#topology')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${value}')
    input.dispatchEvent(new Event('input', { bubbles:true }))
    input.dispatchEvent(new Event('change', { bubbles:true }))
  })()`)
  await pause(220)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: origin })
  await until("!!document.querySelector('.p-hero-stage canvas')")
  await pause(900)
  const reports = []
  for (const theme of ['forest', 'ivory']) {
    if (await evaluate('document.documentElement.dataset.theme') !== theme) {
      await evaluate("document.querySelector('.theme-toggle').click()")
      await pause(250)
    }
    await setTopology(0)
    assert.match(await evaluate("document.querySelector('#topology').getAttribute('aria-valuetext') || ''"), /solid/i,
      'the slider must explain the visible solid state')
    const solid = await canvasImage()
    await setTopology(50)
    assert.match(await evaluate("document.querySelector('#topology').getAttribute('aria-valuetext') || ''"), /wireframe/i,
      'the slider must explain the visible wireframe state')
    const wireframe = await canvasImage()
    await setTopology(100)
    assert.match(await evaluate("document.querySelector('#topology').getAttribute('aria-valuetext') || ''"), /vertices/i,
      'the slider must explain the visible vertex state')
    const vertices = await canvasImage()
    assert.notEqual(solid, wireframe, `${theme} solid and wireframe render differently`)
    assert.notEqual(wireframe, vertices, `${theme} wireframe and vertices render differently`)
    await setTopology(0)
    const canvasBounds = await evaluate(`(() => {
      const r = document.querySelector('.p-hero-canvas canvas').getBoundingClientRect()
      return { x:r.x, y:r.y, width:r.width, height:r.height }
    })()`)
    const center = { x: canvasBounds.x + canvasBounds.width / 2, y: canvasBounds.y + canvasBounds.height / 2 }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y })
    await pause(100)
    const pointerCenter = await canvasImage()
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x + 56, y: center.y + 12 })
    await pause(100)
    assert.notEqual(pointerCenter, await canvasImage(), `${theme} pointer movement subtly turns the vessel`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await pause(150)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y })
    await pause(100)
    await canvasImage()
    await pause(100)
    const reducedStatic = await canvasImage()
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x + 56, y: center.y + 12 })
    await pause(100)
    const reducedMoved = await canvasImage()
    assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), true)
    assert.ok(reducedStatic === reducedMoved, `${theme} live reduced-motion preference stops pointer tilt`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
    await send('Emulation.setEmulatedMedia', { features: [] })
    for (const width of [1440, 1024, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 844 : 900, deviceScaleFactor: 1, mobile: false })
      await pause(150)
      const state = await evaluate(`(() => {
        const source = document.querySelector('.p-source-float').getBoundingClientRect()
        const controls = document.querySelector('.p-stage-controls').getBoundingClientRect()
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          canvas: !!document.querySelector('.p-hero-stage canvas'), sourceBottom: source.bottom, controlsTop: controls.top }
      })()`)
      assert.ok(state.scrollWidth <= state.width, `${theme} ${width}px must not overflow`)
      assert.ok(state.canvas, `${theme} ${width}px retains the interactive scene`)
      if (width <= 390) assert.ok(state.controlsTop - state.sourceBottom >= 8,
        `${theme} ${width}px source study and slider must remain separate`)
      reports.push({ theme, ...state })
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  }
  assert.deepEqual(appErrors, [], 'the landing must have no application console errors')
  console.log(JSON.stringify({ result: 'PASS', reports, appErrors }))
} finally {
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`)
}
