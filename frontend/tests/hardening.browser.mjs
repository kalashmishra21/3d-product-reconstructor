// Test-only CDP fixture for Stage 11A recovery. Uses a separate browser tab.
import assert from 'node:assert/strict'

const origin = 'http://127.0.0.1:5173'
const debug = 'http://127.0.0.1:9224'
const rowId = '22222222-2222-4222-8222-222222222222'
const ownerId = '11111111-1111-4111-8111-111111111111'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
const runtimeErrors = []
const inferRequests = []
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20_000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.id && pending.has(data.id)) {
    const task = pending.get(data.id)
    clearTimeout(task.timer); pending.delete(data.id)
    data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result)
  }
  if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails.text)
  if (data.method === 'Network.requestWillBeSent' && data.params.request.url.includes('/api/v1/reconstructions/infer')) inferRequests.push(data.params.request.url)
  if (data.method === 'Fetch.requestPaused') {
    const body = `
      const user = { id: '${ownerId}', email: 'test@example.invalid', user_metadata: { display_name: 'Hardening Test' } };
      let listener = () => {};
      window.__hardening = { listFailures: 1, detailFailures: 2, signedUrls: 0, failSourceSign: 0, verifyError: false, user,
        expire() { this.user = null; listener('SIGNED_OUT', null); },
        restore() { this.user = user; listener('SIGNED_IN', { user }); } };
      const row = { id: '${rowId}', user_id: user.id, object_name: 'Chair', source_filename: 'chair.png',
        source_path: user.id + '/${rowId}/source.png', status: 'failed', created_at: '2026-10-08T00:00:00Z' };
      export const authConfigured = true;
      export const supabase = {
        auth: {
          onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
          async getUser() { return { data: { user: window.__hardening.user }, error: null }; },
        },
        from(table) {
          const query = { select() { return this; }, eq() { return this; }, in() { return this; }, or() { return this; }, order() { return this; },
            async range() { if (window.__hardening.listFailures-- > 0) return { data: null, error: new Error('Offline') }; return { data: [row], error: null }; },
            async maybeSingle() { if (table === 'profiles') return { data: { id: user.id, display_name: 'Hardening Test', avatar_path: null }, error: null };
              if (window.__hardening.detailFailures-- > 0) return { data: null, error: new Error('Offline') }; return { data: row, error: null }; },
          }; return query;
        },
        storage: { from() { return { async createSignedUrl() { if (window.__hardening.failSourceSign-- > 0) return { data: null, error: new Error('Offline') }; const count = ++window.__hardening.signedUrls;
          return { data: { signedUrl: count === 1 ? 'data:image/png;base64,broken' : '${png}' }, error: null }; } }; } },
      };
      export async function getCurrentUser() { if (window.__hardening.verifyError) throw new Error('Network unavailable'); return window.__hardening.user; }
      export async function getCurrentSession() { return null; }
      export async function signOut() { window.__hardening.expire(); }
      export async function signInWithEmail() { throw new Error('test only'); }
      export const signUpWithEmail = signInWithEmail, signInWithGoogle = signInWithEmail,
        sendPasswordReset = signInWithEmail, updatePassword = signInWithEmail, exchangeAuthCode = signInWithEmail;
    `
    send('Fetch.fulfillRequest', { requestId: data.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(body).toString('base64') }).catch(() => {})
  }
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const until = async (expression) => {
  for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for ${expression}`)
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/src/lib/auth.js*` }] })
  await send('Page.navigate', { url: origin + '/history' })
  await until("!!document.querySelector('.history-feedback[role=alert]')")
  assert.equal(await evaluate("!!document.querySelector('.history-feedback button')"), true, 'History failure offers Retry')
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `History retry fits ${width}px`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await evaluate("document.querySelector('.history-feedback button').click()")
  await until("!!document.querySelector('.history-card img') && window.__hardening.signedUrls >= 2")
  await until("document.querySelector('.history-card img').naturalWidth === 1")
  assert.equal(inferRequests.length, 0)
  await evaluate("window.__hardening.failSourceSign = 1")
  await evaluate("document.querySelector('.history-card-link').click()")
  await until("location.pathname.startsWith('/reconstructions/')")
  await until("!!document.querySelector('.result-detail-state[role=alert]')")
  assert.equal(await evaluate("!!document.querySelector('.result-detail-state button')"), true, 'Result Detail failure offers Retry')
  await evaluate("document.querySelector('.result-detail-state button').click()")
  await until("!!document.querySelector('.result-detail-grid')")
  await evaluate("document.querySelector('.result-view-tabs [data-view=input]').click()")
  await until("!!document.querySelector('.recon-view-panel .result-detail-state')")
  assert.equal(await evaluate("!!document.querySelector('.recon-view-panel .result-detail-state button')"), true, 'failed source image offers Retry')
  await evaluate("document.querySelector('.recon-view-panel .result-detail-state button').click()")
  await until("!!document.querySelector('.source-view img')")
  await evaluate("document.querySelector('.dash-sidebar-user').click()")
  await until("document.querySelector('.profile-dialog').open")
  await evaluate("document.querySelector('.profile-dialog-close').click()")
  await until("!document.querySelector('.profile-dialog').open")
  await until("document.activeElement === document.querySelector('.dash-sidebar-user')")
  await evaluate("document.querySelector('.dash-profile-menu summary').click(); document.querySelector('.dash-profile-popover button').click()")
  await until("document.querySelector('.profile-dialog').open")
  await evaluate("document.querySelector('.profile-dialog-close').click()")
  await until("document.activeElement === document.querySelector('.dash-profile-menu summary')")
  const wasCollapsed = await evaluate("document.querySelector('.dash-layout').classList.contains('is-sidebar-collapsed')")
  await evaluate("document.querySelector('.dash-sidebar-collapse').click()")
  assert.equal(await evaluate("document.querySelector('.dash-layout').classList.contains('is-sidebar-collapsed')"), !wasCollapsed)
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.dash-sidebar nav a')).every(link => !!link.getAttribute('aria-label') && !!link.getAttribute('title'))"), true)
  await evaluate("localStorage.setItem('reconstruct.sidebar.collapsed', 'false')")
  await evaluate("window.__hardening.verifyError = true; window.dispatchEvent(new Event('focus'))")
  await delay(250)
  assert.equal(await evaluate("location.pathname.startsWith('/reconstructions/')"), true, 'transient verification error keeps workspace')
  await evaluate("window.__hardening.verifyError = false; window.__hardening.user = null; window.dispatchEvent(new Event('focus'))")
  await until("location.pathname === '/login'")
  assert.equal(await evaluate("history.state?.usr?.from?.pathname"), `/reconstructions/${rowId}`)
  await evaluate("window.__hardening.restore()")
  await until(`location.pathname === '/reconstructions/${rowId}'`)
  await send('Page.navigate', { url: origin + '/not-a-page' })
  await until("!!document.querySelector('[data-page=not-found]')")
  assert.equal(await evaluate(`!!document.querySelector('a[href="/dashboard"]') && !!document.querySelector('a[href="/reconstruct"]')`), true)
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `404 fits ${width}px`)
  }
  assert.deepEqual(runtimeErrors, [])
  console.log('PASS History thumbnail/retry, Result Detail retry, profile focus, auth expiry, 404')
} finally {
  await send('Fetch.disable').catch(() => {})
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`).catch(() => {})
}
