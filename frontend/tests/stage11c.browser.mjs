// Test-only CDP fixture. Auth is mocked in a separate browser tab by intercepted
// module responses; no session is written to storage and no preview route exists.
// Run with visible Chrome debugging on 9224 and Vite on 5173:
// node tests/dashboard.browser.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5173'
const debug = 'http://127.0.0.1:9224'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
let authenticated = true
let healthStatus = 'connected'
const runtimeErrors = []
const reactKeyWarnings = []
const interceptionErrors = []
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 20_000)
  pending.set(id, { resolve, reject, timeout })
  socket.send(JSON.stringify({ id, method, params }))
})
const mockAuth = () => `
  let listener = () => {};
  const user = ${authenticated ? JSON.stringify({ id: 'test-only', email: 'a-long-unbroken-address-for-responsive-testing@example.invalid', user_metadata: { display_name: 'A Very Long Display Name For A Realistic Workspace Account With Limited Space' }, identities: [{ provider: 'google' }], created_at: '2026-01-10T00:00:00Z' }) : 'null'};
  window.__dashboardTest = { user, logoutCalls: 0, failLogout: false, getUserCalls: 0, profileCalls: 0 };
  export const authConfigured = true;
  export const supabase = {
    auth: {
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async getUser() { return { data: { user: window.__dashboardTest.user }, error: null }; },
    },
    from(table) {
      if (table === 'profiles') window.__dashboardTest.profileCalls++;
      const query = { select() { return this; }, eq() { return this; }, in() { return this; }, or() { return this; }, order() { return this; }, insert() { return this; }, update() { return this; },
        async range() { return { data: [], error: null }; },
        async maybeSingle() { return { data: { id: user?.id, display_name: 'A Very Long Display Name For A Realistic Workspace Account With Limited Space', avatar_path: null }, error: null }; },
        then(resolve) { return Promise.resolve({ count: 0, error: null }).then(resolve); } };
      return query;
    },
  };
  export async function getCurrentUser() { window.__dashboardTest.getUserCalls++; return window.__dashboardTest.user; }
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
  if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails.text)
  if (data.method === 'Runtime.consoleAPICalled') {
    const message = (data.params.args || []).map((arg) => String(arg.value ?? arg.description ?? '')).join(' ')
    if (/Encountered two children with the same key|Each child in a list should have a unique key prop/i.test(message)) {
      reactKeyWarnings.push(message)
    }
  }
  if (data.method === 'Fetch.requestPaused') {
    const { requestId, request } = data.params
    const isAuth = new URL(request.url).pathname === '/src/lib/auth.js'
    const body = isAuth ? mockAuth() : JSON.stringify({ status: 'ok', service: '3d-reconstruction-api' })
    send('Fetch.fulfillRequest', { requestId, responseCode: isAuth || healthStatus === 'connected' ? 200 : 503, responseHeaders: [{ name: 'Content-Type', value: isAuth ? 'text/javascript' : 'application/json' }], body: Buffer.from(body).toString('base64') }).catch((error) => interceptionErrors.push(error.message))
  }
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const until = async (expression) => {
  for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(expression)) return; await delay(150) }
  throw new Error(`Timed out waiting for ${expression}`)
}
const viewport = (width) => send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
const visit = async (path, selector) => {
  await send('Page.navigate', { url: origin + path })
  await until(authenticated ? `!!document.querySelector('${selector}')` : "location.pathname === '/login' && !!document.querySelector('.auth-form')")
}

const failures = []
const check = (value, message) => { if (!value) failures.push(message) }
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/src/lib/auth.js*` }] })
  await viewport(1440)
  await visit('/dashboard', '.dash-layout')
  check(await evaluate(`!!document.querySelector('.dash-brand .dash-brand-copy .dash-sidebar-caption')`), 'Brand name and tagline share one lockup')
  check(await evaluate(`document.querySelectorAll('.dashboard-content a[href="/reconstruct"]').length === 1`), 'Overview has one primary reconstruction action')
  await visit('/missing-stage11c-page', '[data-page=not-found]')
  check(await evaluate(`!!document.querySelector('.dash-sidebar') && !document.querySelector('.site-header')`), 'Authenticated 404 retains workspace navigation')
  await visit('/history', '#history-title')
  check(await evaluate(`document.querySelector('#history-title').textContent === 'History'`), 'History uses a concise heading')
  await visit('/model', '.model-stage-grid')
  check(await evaluate(`document.querySelector('.model-stage-grid').getBoundingClientRect().top < document.querySelector('.model-pipeline').getBoundingClientRect().top`), 'Stage facts precede the quiet pipeline')
  await visit('/reconstruct', '.recon-page')
  check(await evaluate(`document.querySelector('.recon-pipeline').compareDocumentPosition(document.querySelector('.recon-workspace')) & Node.DOCUMENT_POSITION_FOLLOWING`), 'Process rail leads the workspace before reconstruction')
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await viewport(width)
    for (const [route, selector] of [['/dashboard','.dash-layout'],['/history','#history-search'],['/model','.model-stage-grid'],['/reconstruct','.recon-page']]) {
      await visit(route, selector)
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${route} fits ${width}px`)
    }
    await visit('/history', '#history-search')
    check(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#history-search')).fontSize) >= 16`), `Search avoids input zoom at ${width}px`)
    await evaluate(`document.querySelector('.dash-profile-menu summary').click(); document.querySelector('.dash-profile-popover button').click()`)
    await until(`document.querySelector('.profile-dialog').open`)
    check(await evaluate(`(() => { const r = document.querySelector('.profile-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth })()`), `Profile fits ${width}px`)
    await evaluate(`document.querySelector('.profile-dialog-close').click()`)
    await until(`document.activeElement === document.querySelector('.dash-profile-menu summary')`)
  }
  await evaluate(`document.querySelector('.dash-profile-menu summary').click(); document.querySelector('.dash-profile-popover button').dispatchEvent(new MouseEvent('click', { bubbles:true, detail:1 }))`)
  check(await evaluate(`document.querySelector('.profile-dialog').dataset.motion === 'pointer' && getComputedStyle(document.querySelector('.profile-dialog')).transitionDuration.includes('0.2s')`), 'Pointer dialog uses a bounded 200ms transition')
  await send('Emulation.setEmulatedMedia', { features: [{ name:'prefers-reduced-motion', value:'reduce' }] })
  check(await evaluate(`getComputedStyle(document.querySelector('.profile-dialog')).transitionDuration.split(',').every(v => parseFloat(v) === 0)`), 'Reduced motion disables dialog transitions')
  await evaluate(`document.querySelector('.profile-dialog-close').click()`)
  authenticated = false
  await send('Page.navigate', { url: origin + '/public-missing-page' })
  await until(`!!document.querySelector('[data-page=not-found]')`)
  check(await evaluate(`!!document.querySelector('.site-header') && !document.querySelector('.dash-sidebar')`), 'Signed-out 404 retains public navigation')
  check(runtimeErrors.length === 0, 'No application exceptions')
  check(reactKeyWarnings.length === 0, 'No duplicate React keys')
  assert.deepEqual(failures, [], 'Stage 11C regression checks')
  console.log('PASS Stage 11C hierarchy, authenticated 404, responsive controls, profile focus and reduced motion')
} finally {
  await send('Fetch.disable').catch(() => {})
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`).catch(() => {})
}
