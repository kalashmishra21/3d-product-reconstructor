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
  const user = ${authenticated ? JSON.stringify({ id: 'test-only', email: 'layout-test@example.invalid', user_metadata: { display_name: 'Workspace Test' }, identities: [{ provider: 'google' }], created_at: '2026-01-10T00:00:00Z' }) : 'null'};
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
        async maybeSingle() { return { data: { id: user?.id, display_name: 'Workspace Test', avatar_path: null }, error: null }; },
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
await mkdir(new URL('../.review/', import.meta.url), { recursive: true })
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/src/lib/auth.js*` }] })
  await visit('/dashboard', '.dash-layout')
  assert.equal(await evaluate("!!document.querySelector('.global-job-status')"), true, 'workspace exposes job status')
  assert.ok(await evaluate('window.__dashboardTest.profileCalls') > 0, 'persistent profile provider loads own row')
  const authLoads = await evaluate('window.__dashboardTest.getUserCalls')
  await evaluate("document.querySelector('a[href=\"/model\"]').click()")
  await until("location.pathname === '/model' && !!document.querySelector('#model-page-title')")
  await evaluate("document.querySelector('a[href=\"/profile\"]').click()")
  await until("location.pathname === '/profile' && !!document.querySelector('#profile-title')")
  assert.equal(await evaluate('window.__dashboardTest.getUserCalls'), authLoads, 'SPA navigation retains authenticated parent')
  for (const [path, selector] of [['/history','#history-title'], ['/model','#model-page-title'], ['/profile','#profile-title'], ['/reconstructions/not-persisted','#result-detail-title']]) {
    await visit(path, selector)
    assert.equal(await evaluate("document.querySelectorAll('main').length"), 1)
    assert.equal(await evaluate("document.querySelectorAll('h1').length"), 1)
    if (!path.startsWith('/reconstructions')) assert.equal(await evaluate(`document.querySelector('.dash-sidebar nav a[aria-current="page"]').getAttribute('href')`), path)
    if (path === '/history') {
      await until("!!document.querySelector('.history-empty')")
      assert.equal(await evaluate("document.querySelector('#history-search').disabled"), false)
      assert.equal(await evaluate("document.querySelector('.history-empty').textContent.includes('No saved reconstructions yet.')"), true)
    }
    if (path === '/model') {
      assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.model-evaluation dd'), n => n.textContent)"), ['0.037181','0.000640','0.001722'])
      assert.equal(await evaluate("document.body.innerText.includes('The current checkpoint is retained for integration testing while reconstruction quality is being re-evaluated.')"), true)
      assert.equal(await evaluate("!!document.querySelector('button[aria-label=\"Explore Stage 02\"]')"), true, 'stage selector is interactive')
      await evaluate("document.querySelector('button[aria-label=\"Explore Stage 02\"]').click()")
      assert.equal(await evaluate("document.querySelector('.model-selected-stage').textContent.includes('618')"), true)
      await evaluate("document.querySelector('.model-evaluation summary').click()")
      assert.equal(await evaluate("document.querySelector('.model-evaluation details').open"), true)
    }
    if (path === '/profile') {
      assert.equal(await evaluate("document.querySelector('.profile-details').textContent.includes('layout-test@example.invalid')"), true)
      assert.equal(await evaluate("document.querySelector('.profile-details').textContent.includes('Google')"), true)
      assert.equal(await evaluate("document.querySelector('.profile-statistics').textContent.includes('Total reconstructions')"), true)
      assert.equal(await evaluate("document.querySelector('.profile-statistics').textContent.includes('Low volume')"), true)
      assert.equal(await evaluate("!!document.querySelector('.profile-edit-button')"), true, 'Profile has an editable saved display name')
    }
    for (const width of [1440,1280,1024,768,390,320]) {
      await viewport(width); await delay(180)
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${path}: no overflow ${width}`)
      const capture = await send('Page.captureScreenshot', { format:'png' })
      await writeFile(new URL(`../.review/workspace-${path.split('/')[1]}-${width}.png`, import.meta.url), Buffer.from(capture.data,'base64'))
    }
    console.log(`PASS ${path}: content, semantics and six responsive widths (test-only session)`)
  }
  authenticated = false
  for (const path of ['/dashboard','/reconstruct','/history','/model','/profile','/reconstructions/not-persisted']) {
    await visit(path)
    assert.equal(await evaluate("!!document.querySelector('.dash-layout')"), false)
  }
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(reactKeyWarnings, [], 'workspace routes must not emit React list-key warnings')
  assert.deepEqual(interceptionErrors, [])
  console.log('PASS all protected routes redirect without session; no runtime errors')
} finally {
  await send('Fetch.disable').catch(() => {})
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`).catch(() => {})
}
