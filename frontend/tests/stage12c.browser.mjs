import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173'
const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9230}`
const artifacts = new URL('../.review/stage12c/', import.meta.url)
await mkdir(artifacts, { recursive: true })
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const appErrors = []
const requestedUrls = []
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id)
    pending.delete(message.id)
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') appErrors.push(message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    appErrors.push((message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' '))
  }
  if (message.method === 'Network.requestWillBeSent') requestedUrls.push(message.params.request.url)
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 20_000)
  pending.set(id, {
    resolve: value => { clearTimeout(timer); resolve(value) },
    reject: error => { clearTimeout(timer); reject(error) },
  })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description || expression}`)
  return result.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const sampleMainThreadWork = async () => {
  const read = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  const before = await read()
  await pause(1800)
  const after = await read()
  const deltaMs = name => +(((after[name] || 0) - (before[name] || 0)) * 1000).toFixed(2)
  return { taskMs: deltaMs('TaskDuration'), scriptMs: deltaMs('ScriptDuration'), layoutMs: deltaMs('LayoutDuration'), styleMs: deltaMs('RecalcStyleDuration') }
}
const until = async expression => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}
const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
})
const screenshot = async name => {
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL(name, artifacts), Buffer.from(image.data, 'base64'))
}
const frameSample = `(() => new Promise(resolve => {
  const frames = []; let last = 0; const start = performance.now();
  const tick = now => { if (last) frames.push(now - last); last = now;
    if (now - start < 1800) requestAnimationFrame(tick);
    else { const sorted = [...frames].sort((a,b)=>a-b); resolve({count:frames.length,
      averageMs:+(frames.reduce((a,b)=>a+b,0)/Math.max(frames.length,1)).toFixed(2),
      p95Ms:+(sorted[Math.floor(sorted.length*.95)]||0).toFixed(2),
      over20ms:frames.filter(value=>value>20).length,
      jsHeapBytes:performance.memory?.usedJSHeapSize ?? null,
      longTaskCount:performance.getEntriesByType('longtask').length}); }
  }; requestAnimationFrame(tick);
}))()`

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Performance.enable')
  await viewport(1440)
  await send('Page.navigate', { url: origin })
  await until("!!document.querySelector('.p-hero-stage canvas') && !!document.querySelector('.theme-toggle')")
  await until("!!document.querySelector('.p-preview-canvas canvas')")
  assert.equal(await evaluate("document.querySelectorAll('.p-hero-stage canvas, .p-preview-canvas canvas').length"), 2,
    'the hero and embedded Vessel study each keep their own illustrative Three.js scene')
  await evaluate('window.scrollTo(0,0)')
  await pause(900)

  const baselineFile = new URL('landing-before-metrics.json', artifacts)
  if (!existsSync(baselineFile)) {
    const baseline = await evaluate(frameSample)
    await writeFile(baselineFile, JSON.stringify({ capturedAt: new Date().toISOString(), viewport: 1440, frameSample: baseline }, null, 2))
  }
  for (const theme of ['forest', 'ivory']) {
    await evaluate(`(() => { const button=document.querySelector('.theme-toggle'); if(document.documentElement.dataset.theme!=='${theme}') button.click() })()`)
    await until(`document.documentElement.dataset.theme === '${theme}'`)
    await pause(250)
    const baselineName = `landing-before-${theme}-verified-1440.png`
    const baselineImage = new URL(baselineName, artifacts)
    if (!existsSync(baselineImage)) await screenshot(baselineName)
  }

  const lensExists = await evaluate("!!document.querySelector('[data-landing-liquid-surface]')")
  assert.ok(lensExists, 'the approved landing must mount its isolated Liquid Glass surface')
  await until("document.querySelector('[data-landing-liquid-surface]')?.dataset.liquidState === 'performance-fallback'")
  const backend = await evaluate("document.querySelector('[data-landing-liquid-surface]').dataset.liquidBackend")
  assert.equal(backend, 'css', 'measured GPU startup cost keeps the public landing on its CSS glass fallback')
  assert.equal(await evaluate('!!window.__liquidGLRenderer__'), false, 'the costly GPU renderer must not initialize on the public landing')
  assert.equal(requestedUrls.some(url => /liquidGL-[^/]+\.js/i.test(url)), false, 'the disabled GPU chunk must not download for public visitors')

  const report = { backend, liquidGpuDisabledForPerformance: true, responsive: [], themes: [], interactions: {}, performance: {}, appErrors }
  for (const theme of ['forest', 'ivory']) {
    await evaluate(`(() => { const button=document.querySelector('.theme-toggle'); if(document.documentElement.dataset.theme!=='${theme}') button.click() })()`)
    await until(`document.documentElement.dataset.theme === '${theme}'`)
    for (const width of [1440, 1024, 390, 320]) {
      await viewport(width, width < 500 ? 844 : 900)
      await pause(300)
      const metrics = await evaluate(`(() => {
        const stage = document.querySelector('.p-hero-stage').getBoundingClientRect()
        const glass = document.querySelector('[data-landing-liquid-surface]').getBoundingClientRect()
        return { theme:document.documentElement.dataset.theme, width:innerWidth,
          scrollWidth:document.documentElement.scrollWidth, noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth,
          stageWidth:Math.round(stage.width), glassRect:{width:Math.round(glass.width),height:Math.round(glass.height)},
          backend:document.querySelector('[data-landing-liquid-surface]').dataset.liquidBackend }
      })()`)
      report.responsive.push(metrics)
      assert.equal(metrics.noHorizontalOverflow, true, `${theme} ${width}px must not overflow horizontally: ${JSON.stringify(metrics)}`)
      if (width < 768) assert.equal(metrics.backend, 'css', 'small screens use the light CSS lens instead of the page-wide GPU renderer')
      if (width === 1440) {
        await evaluate('window.scrollTo(0,0)')
        await screenshot(`landing-after-${theme}-1440.png`)
        await evaluate('window.scrollTo(0,180)')
        await pause(450)
        await screenshot(`landing-after-${theme}-sticky-glass.png`)
        await evaluate('window.scrollTo(0,0)')
      }
      if (width === 390) {
        await evaluate('window.scrollTo(0,0)')
        await screenshot(`landing-after-${theme}-390.png`)
      }
    }
    report.themes.push(theme)
  }

  await viewport(1440)
  await evaluate(`window.scrollTo(0,0)`)
  await evaluate(`(() => { const canvas=document.querySelector('.p-hero-stage canvas'); const r=canvas.getBoundingClientRect(); window.__stage12cCanvasPoint={x:r.left+r.width*.5,y:r.top+r.height*.5}; })()`)
  const beforeOrbit = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const point = await evaluate('window.__stage12cCanvasPoint')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 90, y: point.y + 22, button: 'left', buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 90, y: point.y + 22, button: 'left', buttons: 0, clickCount: 1 })
  await pause(250)
  const afterOrbit = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  report.interactions.orbitChangesRenderedView = beforeOrbit.data !== afterOrbit.data
  assert.equal(report.interactions.orbitChangesRenderedView, true, 'dragging on the vessel canvas must change the rendered view')

  const beforeTopology = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await evaluate(`(() => { const slider=document.querySelector('#topology'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(slider,'84'); slider.dispatchEvent(new Event('input',{bubbles:true})); slider.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await pause(300)
  const afterTopology = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  report.interactions.topologyChangesRenderedView = beforeTopology.data !== afterTopology.data
  assert.equal(report.interactions.topologyChangesRenderedView, true, 'topology reveal must change the rendered vessel')

  await evaluate('window.scrollTo(0,0)')
  report.performance.withCssFallback = await evaluate(frameSample)
  report.performance.baseline = JSON.parse(await readFile(baselineFile, 'utf8')).frameSample
  report.performance.cssFallbackMainThread = await sampleMainThreadWork()

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await until("document.querySelector('[data-landing-liquid-surface]')?.dataset.liquidState === 'reduced-motion'")
  report.reducedMotion = await evaluate(`(() => {
    const surface = document.querySelector('[data-landing-liquid-surface]')
    return { state:surface?.dataset.liquidState,
      backdrop:surface ? getComputedStyle(surface).backdropFilter : 'none',
      renderer:!!window.__liquidGLRenderer__ }
  })()`)
  assert.equal(report.reducedMotion.renderer, false, 'GPU lens stays disabled when reduced motion is requested')
  assert.equal(report.reducedMotion.backdrop, 'none', 'reduced motion removes the glass backdrop filter')

  await send('Emulation.setEmulatedMedia', { features: [] })
  await until("document.querySelector('[data-landing-liquid-surface]')?.dataset.liquidState === 'performance-fallback'")
  report.cssFallback = await evaluate(`(() => {
    const surface = document.querySelector('[data-landing-liquid-surface]')
    return { backend:surface?.dataset.liquidBackend,
      backdrop:surface ? getComputedStyle(surface).backdropFilter : 'none' }
  })()`)
  assert.equal(report.cssFallback.backend, 'css')
  assert.match(report.cssFallback.backdrop, /blur/i)

  await evaluate("document.querySelector('.theme-toggle').click()")
  await pause(300)
  report.themesReactAfterGlassMount = await evaluate('document.documentElement.dataset.theme')
  assert.equal(report.themesReactAfterGlassMount, 'forest', 'theme control remains live above the glass surface')

  report.seo = await evaluate(`(() => {
    const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
    return { title:document.title, robots:document.querySelector('meta[name="robots"]').content,
      schemaType:schema['@type'], schemaName:schema.name, ogTitle:document.querySelector('meta[property="og:title"]').content,
      canonical:!!document.querySelector('link[rel="canonical"]') }
  })()`)
  assert.equal(report.seo.robots, 'index, follow')
  assert.equal(report.seo.schemaType, 'SoftwareApplication')
  assert.equal(report.seo.canonical, false, 'no unchosen production domain is emitted as canonical')

  await evaluate('window.__stage12cSurfaceBeforeRoute = document.querySelector(\'[data-landing-liquid-surface]\'); true')
  await evaluate(`document.querySelector('.site-header .header-explore').click()`)
  await until("['/dashboard','/login'].includes(location.pathname) && document.querySelector('meta[name=robots]')?.content === 'noindex, nofollow'")
  report.reactCleanup = await evaluate('!window.__stage12cSurfaceBeforeRoute?.isConnected')
  assert.equal(report.reactCleanup, true, 'leaving the landing removes its scoped glass surface')
  await send('Page.navigate', { url: origin })
  await until("!!document.querySelector('.p-hero-stage canvas') && document.querySelector('[data-landing-liquid-surface]')?.dataset.liquidState === 'performance-fallback'")
  await evaluate(`(() => { const button=document.querySelector('.theme-toggle'); if(document.documentElement.dataset.theme!=='forest') button.click(); window.scrollTo(0,0) })()`)
  await pause(300)
  assert.deepEqual(appErrors, [], 'the landing has no application console errors')
  await send('Page.bringToFront')
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket.close()
}
