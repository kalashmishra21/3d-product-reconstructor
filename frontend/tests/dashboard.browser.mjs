// Test-only CDP fixture. Auth is mocked in a separate browser tab by intercepted
// module responses; no session is written to storage and no preview route exists.
// Run with visible Chrome debugging on 9224 and Vite on 5173:
// node tests/dashboard.browser.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5173'
const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
let authenticated = true
let healthStatus = 'connected'
const runtimeErrors = []
const consoleErrors = []
const networkFailures = []
const requests = new Map()
const interceptionErrors = []
const interceptionEvents = []
const canceledNetworkRequests = new Set()
const pendingInterceptions = new Set()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 20_000)
  pending.set(id, { resolve, reject, timeout })
  socket.send(JSON.stringify({ id, method, params }))
})
const mockAuth = () => `
  let listener = () => {};
  const user = ${authenticated ? JSON.stringify({ id: 'test-only', email: 'layout-test@example.invalid', user_metadata: { display_name: 'Dashboard Test' } }) : 'null'};
  window.__dashboardTest = { user, logoutCalls: 0, failLogout: false };
  export const authConfigured = true;
  export const supabase = { auth: { onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; } } };
  export async function getCurrentUser() { return window.__dashboardTest.user; }
  export async function getCurrentSession() { return null; }
  export async function signOut() { window.__dashboardTest.logoutCalls++; if(window.__dashboardTest.failLogout) throw new Error('Test sign-out failed'); window.__dashboardTest.user = null; listener('SIGNED_OUT', null); }
  export async function signInWithEmail() { throw new Error('Not available in layout tests'); }
  export const signUpWithEmail = signInWithEmail, signInWithGoogle = signInWithEmail, sendPasswordReset = signInWithEmail, updatePassword = signInWithEmail, exchangeAuthCode = signInWithEmail;
`
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.id && pending.has(data.id)) {
    const task = pending.get(data.id)
    clearTimeout(task.timeout); pending.delete(data.id)
    data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result)
  }
  if (data.method === 'Runtime.exceptionThrown') {
    const details = data.params.exceptionDetails
    runtimeErrors.push({
      text: details.text,
      description: details.exception?.description ?? '',
      url: details.url ?? '',
      line: details.lineNumber,
      column: details.columnNumber,
      frames: details.stackTrace?.callFrames?.map(({ functionName, url, lineNumber, columnNumber }) => ({ functionName, url, lineNumber, columnNumber })) ?? [],
    })
  }
  if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
    consoleErrors.push(data.params.args.map(({ value, description }) => value ?? description ?? '').join(' '))
  }
  if (data.method === 'Network.requestWillBeSent') {
    const url = new URL(data.params.request.url)
    if (url.origin === origin) requests.set(data.params.requestId, `${data.params.request.method} ${url.pathname}`)
  }
  if (data.method === 'Network.responseReceived' && data.params.response.status >= 400) {
    networkFailures.push(`${requests.get(data.params.requestId) ?? 'unknown request'}: HTTP ${data.params.response.status}`)
  }
  if (data.method === 'Network.loadingFailed' && !data.params.canceled) {
    networkFailures.push(`${requests.get(data.params.requestId) ?? 'unknown request'}: ${data.params.errorText}`)
  }
  if (data.method === 'Network.loadingFailed' && data.params.canceled) {
    canceledNetworkRequests.add(data.params.requestId)
    interceptionEvents.push({ event: 'canceled', networkId: data.params.requestId, request: requests.get(data.params.requestId) })
  }
  if (data.method === 'Fetch.requestPaused') {
    const { requestId, request } = data.params
    const requestPath = new URL(request.url).pathname
    interceptionEvents.push({ event: 'paused', requestId, networkId: data.params.networkId, requestPath })
    const isAuth = requestPath === '/src/lib/auth.js'
    const body = isAuth ? mockAuth() : JSON.stringify({ status: 'ok', service: '3d-reconstruction-api' })
    let fulfillment
    fulfillment = send('Fetch.fulfillRequest', { requestId, responseCode: isAuth || healthStatus === 'connected' ? 200 : 503, responseHeaders: [{ name: 'Content-Type', value: isAuth || healthStatus === 'connected' ? 'text/javascript' : 'application/json' }], body: Buffer.from(body).toString('base64') })
      .catch((error) => interceptionErrors.push({ requestId, networkId: data.params.networkId, requestPath, message: error.message }))
      .finally(() => pendingInterceptions.delete(fulfillment))
    pendingInterceptions.add(fulfillment)
  }
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const until = async (expression) => {
  for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(expression)) return; await delay(150) }
  const state = await evaluate("({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, visibility: document.visibilityState, motion: document.querySelector('.dash-study')?.dataset.motion })").catch(() => null)
  throw new Error(`Timed out waiting for ${expression}; state=${JSON.stringify(state)}`)
}
const viewport = (width) => send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
const settleInterceptions = async () => {
  while (pendingInterceptions.size) await Promise.allSettled([...pendingInterceptions])
  await delay(50)
}
const visit = async (path = '/dashboard') => {
  await settleInterceptions()
  await send('Page.navigate', { url: origin + path })
  await until(authenticated && path === '/dashboard' ? "!!document.querySelector('.dash-layout')" : "!!document.querySelector('.auth-form')")
}
await mkdir(new URL('../.review/', import.meta.url), { recursive: true })
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Fetch.enable', { patterns: [
    { urlPattern: `${origin}/src/lib/auth.js*` },
    { urlPattern: `${origin}/api/v1/health*` },
  ] })
  await viewport(1440); await visit()
  await until("getComputedStyle(document.querySelector('.dash-sidebar')).position === 'fixed'")
  await until("!!document.querySelector('#dashboard-title')")
  assert.equal(await evaluate("document.querySelector('#dashboard-title').textContent"), 'Welcome back, Dashboard Test.')
  assert.equal(await evaluate("!!document.querySelector('.dash-system, .dash-sidebar-health')"), false, 'developer diagnostics are absent')
  assert.equal(await evaluate("!!document.querySelector('.dash-api-error')"), false, 'healthy API does not display Retry')
  assert.equal(await evaluate("document.querySelector('.dash-collection-callout').textContent.includes('History')"), true)
  assert.equal(await evaluate("document.querySelector('.dash-categories').textContent.includes('13 trained object categories')"), true)
  assert.equal(await evaluate("document.querySelector('.stage-baseline').textContent.includes('2,466')"), true)
  assert.equal(await evaluate("document.querySelectorAll('.dash-sidebar .dash-navigation a').length"), 4)
  assert.equal(await evaluate("document.querySelector('.dash-command .button').getAttribute('href')"), '/reconstruct')
  await until("!!document.querySelector('.dash-canvas canvas')")
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await viewport(width); await delay(500)
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.dash-sidebar')).display"), width < 768 ? 'none' : 'flex', `Styled sidebar at ${width}px`)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No overflow at ${width}px`)
    assert.equal(await evaluate("document.querySelector('.dash-command .button').getBoundingClientRect().width > 100"), true)
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(new URL(`../.review/dashboard-${width}.png`, import.meta.url), Buffer.from(capture.data, 'base64'))
    console.log(`PASS responsive ${width}px (test-only session)`)
  }
  await evaluate("document.querySelector('.dash-model').scrollIntoView({behavior:'instant'})")
  await delay(150)
  const lowerCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../.review/dashboard-320-model.png', import.meta.url), Buffer.from(lowerCapture.data, 'base64'))
  await evaluate("window.scrollTo({top:0,behavior:'instant'})")
  await evaluate("document.querySelector('.dash-mobile-menu').click()")
  assert.equal(await evaluate("document.querySelector('.dash-drawer').open"), true)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await until("!document.querySelector('.dash-drawer').open")
  await until("document.activeElement === document.querySelector('.dash-mobile-menu')")
  await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await until("matchMedia('(prefers-reduced-motion: reduce)').matches")
  await until("document.querySelector('.dash-study').dataset.motion === 'paused'")
  await evaluate("document.querySelector('.dash-study-controls button:last-child').click()")
  assert.equal(await evaluate("document.querySelector('.dash-study-controls button:last-child').getAttribute('aria-pressed')"), 'true')
  await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await until("!matchMedia('(prefers-reduced-motion: reduce)').matches")
  await until("document.querySelector('.dash-study').dataset.motion === 'subtle'")
  // Native visibilitychange is browser-controlled; exercise the scene's real IntersectionObserver boundary instead.
  await evaluate("window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })")
  await until("document.querySelector('.dash-study').dataset.motion === 'paused'")
  await evaluate("document.querySelector('.dash-study').scrollIntoView({ block: 'center', behavior: 'instant' })")
  await until("document.querySelector('.dash-study').dataset.motion === 'subtle'")
  healthStatus = 'unavailable'
  await settleInterceptions()
  await send('Page.reload')
  await until("!!document.querySelector('.dash-api-error')")
  healthStatus = 'connected'
  await evaluate("document.querySelector('.dash-api-error button').click()")
  await until("!document.querySelector('.dash-api-error')")
  await viewport(1440)
  await evaluate("window.__dashboardTest.failLogout = true; document.querySelector('.dash-sidebar .dash-signout').click()")
  await until("!!document.querySelector('.dash-error')")
  assert.equal(await evaluate('location.pathname'), '/dashboard')
  await evaluate("window.__dashboardTest.failLogout = false; document.querySelector('.dash-profile-menu summary').click(); document.querySelector('.dash-profile-menu[open] .dash-profile-popover button:last-child').click()")
  await until("location.pathname === '/login' && !!document.querySelector('.auth-form')")
  assert.equal(await evaluate('window.__dashboardTest.logoutCalls'), 2)
  authenticated = false
  await visit()
  await until("location.pathname === '/login'")
  assert.equal(await evaluate("!!document.querySelector('.dash-layout')"), false)
  assert.deepEqual(runtimeErrors, [], `Browser errors: ${JSON.stringify({ runtimeErrors, consoleErrors, networkFailures }, null, 2)}`)
  // A navigation can cancel an in-flight health request after Fetch.requestPaused.
  // Chrome then invalidates only that interception ID; require the matching
  // Network.loadingFailed(canceled) event before treating it as expected.
  const unexpectedInterceptionErrors = interceptionErrors.filter(({ networkId, requestPath, message }) =>
    !(requestPath === '/api/v1/health' && message === 'Invalid InterceptionId.' && canceledNetworkRequests.has(networkId)))
  assert.deepEqual(unexpectedInterceptionErrors, [], `Interception events: ${JSON.stringify(interceptionEvents)}`)
  console.log('PASS guard, logout success/failure, empty state, API states, drawer focus, display controls, reduced motion; no runtime errors')
} finally {
  await settleInterceptions()
  await send('Fetch.disable').catch(() => {})
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`).catch(() => {})
}
