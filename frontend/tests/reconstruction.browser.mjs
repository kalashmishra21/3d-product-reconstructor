// Run with Vite on 5173 and test-only Chrome debugging on 9224.
// Intercepts auth and preflight only in this isolated browser tab.
import assert from 'node:assert/strict'
import { healthyStage3 } from './fixtures/healthyStage3.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const origin = 'http://127.0.0.1:5173'
const downloadDirectory = new URL('../.review/stage9-browser/', import.meta.url)
const target = await (await fetch('http://127.0.0.1:9224/json/new?about:blank', { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
const pending = new Map()
const errors = []
let serial = 0
let authenticated = true
let preflightStatus = 200
let requests = 0
let mockMesh = JSON.stringify(healthyStage3())
let deferInfer = false
let pendingInferRequest = null
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const mockAuth = () => `
  let listener = () => {};
  const user = ${authenticated ? JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', email: 'browser-test@example.invalid', user_metadata: { display_name: 'Browser Test' } }) : 'null'};
  window.__reconDb = window.__reconDb || { rows: [], uploads: [] };
  export const authConfigured = true;
  export const supabase = {
    auth: {
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async getUser() { return { data: { user }, error: null }; }
    },
    from(table) {
      let action = 'select', values = null;
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in(key, values) { filters.push([key, values]); return this; },
        or() { return this; },
        order() { return this; },
        async range(start, end) {
          const rows = window.__reconDb.rows.filter(item => filters.every(([key, value]) => Array.isArray(value) ? value.includes(item[key]) : item[key] === value));
          return { data: rows.slice(start, end + 1), error: null };
        },
        insert(value) { action = 'insert'; values = value; return this; },
        update(value) { action = 'update'; values = value; return this; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { id: user?.id, display_name: 'Browser Test', avatar_path: null }, error: null };
          if (action === 'insert') {
            const row = { ...values, id: '00000000-0000-4000-8000-000000000002', created_at: new Date().toISOString() };
            window.__reconDb.rows.push(row);
            return { data: row, error: null };
          }
          const row = window.__reconDb.rows.find(item => filters.every(([key, value]) => item[key] === value));
          if (action === 'update' && row) Object.assign(row, values);
          return { data: row || null, error: null };
        }
      };
      return query;
    },
    storage: { from(bucket) { return {
      async upload(path, blob) { window.__reconDb.uploads.push({ bucket, path, size: blob.size, blob }); return { data: { path }, error: null }; },
      async download(path) { const saved = window.__reconDb.uploads.find(item => item.bucket === bucket && item.path === path); return saved ? { data: saved.blob, error: null } : { data: null, error: new Error('Not found') }; },
      async createSignedUrl(path) { const saved = window.__reconDb.uploads.find(item => item.bucket === bucket && item.path === path); return saved ? { data: { signedUrl: URL.createObjectURL(saved.blob) }, error: null } : { data: null, error: new Error('Not found') }; }
    }; } }
  };
  export async function getCurrentUser() { return user; }
  export async function getCurrentSession() { return user ? { access_token: 'browser-test-token' } : null; }
  export async function signOut() { listener('SIGNED_OUT', null); }
  export async function signInWithEmail() { throw new Error('Test-only browser'); }
  export const signUpWithEmail = signInWithEmail, signInWithGoogle = signInWithEmail, sendPasswordReset = signInWithEmail, updatePassword = signInWithEmail, exchangeAuthCode = signInWithEmail;
`
socket.addEventListener('message', (event) => {
  const result = JSON.parse(event.data)
  if (result.id && pending.has(result.id)) {
    const task = pending.get(result.id); clearTimeout(task.timer); pending.delete(result.id)
    result.error ? task.reject(new Error(result.error.message)) : task.resolve(result.result)
  }
  if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.text)
  if (result.method === 'Fetch.requestPaused') {
    const { requestId, request } = result.params
    const path = new URL(request.url).pathname
    if (path === '/api/v1/reconstructions/infer' && deferInfer) {
      requests += 1
      pendingInferRequest = requestId
      return
    }
    const auth = path === '/src/lib/auth.js'
    if (!auth) {
      requests += 1
      if (request.headers.Authorization !== 'Bearer browser-test-token') errors.push('Missing test bearer token')
    }
    const body = auth ? mockAuth() : path === '/api/v1/reconstructions/infer' ? mockMesh : preflightStatus === 200
      ? JSON.stringify({ status: 'ready', filename: 'sample.png', content_type: 'image/png', format: 'PNG', width: 8, height: 8, size_bytes: 96, user_id: '00000000-0000-4000-8000-000000000001' })
      : JSON.stringify({ detail: 'test failure' })
    send('Fetch.fulfillRequest', { requestId, responseCode: auth ? 200 : preflightStatus, responseHeaders: [{ name: 'Content-Type', value: auth ? 'text/javascript' : 'application/json' }], body: Buffer.from(body).toString('base64') }).catch((error) => errors.push(error.message))
  }
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const until = async (expression) => {
  for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(150) }
  throw new Error(`Waited for ${expression}`)
}
const visit = async (path, selector) => { await send('Page.navigate', { url: origin + path }); await until(`!!document.querySelector('${selector}')`) }
const viewport = (width) => send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
await mkdir(new URL('../.review/', import.meta.url), { recursive: true })
await mkdir(downloadDirectory, { recursive: true })
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: fileURLToPath(downloadDirectory) })
  await send('Fetch.enable', { patterns: [
    { urlPattern: `${origin}/src/lib/auth.js*` },
    { urlPattern: `${origin}/api/v1/reconstructions/preflight*` },
    { urlPattern: `${origin}/api/v1/reconstructions/infer*` },
  ] })
  await viewport(1440)
  await visit('/', '.site-wrap')
  authenticated = false
  await visit('/login', '.auth-form')
  await visit('/signup', '.auth-form')
  authenticated = true
  await visit('/dashboard', '.dash-layout')
  assert.equal(await evaluate("document.querySelector('.dash-command .button').getAttribute('href')"), '/reconstruct')
  await evaluate("document.querySelector('.dash-command .button').click()")
  await until("location.pathname === '/reconstruct' && !!document.querySelector('.recon-page')")
  await until("!!document.querySelector('.recon-scene canvas')")
  assert.equal(await evaluate("!!document.querySelector('.recon-export')"), false)
  assert.equal(await evaluate("document.body.innerText.includes('Preflight checks the image only.')"), true)
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await viewport(width); await delay(400)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No overflow at ${width}`)
    assert.equal(await evaluate("document.querySelector('.recon-browse').getBoundingClientRect().width > 70"), true)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(new URL(`../.review/reconstruct-${width}.png`, import.meta.url), Buffer.from(shot.data, 'base64'))
    console.log(`PASS workspace responsive ${width}`)
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await until("document.querySelector('.recon-viewport').dataset.motion === 'paused'")
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'sample.png', {type:'image/png'}));
    const input = document.querySelector('.recon-drop input');
    Object.defineProperty(input, 'files', {configurable:true, value:transfer.files});
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`)
  await until("document.querySelector('.recon-selection')?.textContent.includes('sample.png')")
  await evaluate(`(() => {
    const input = document.querySelector('.recon-object-field input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Whiteboard');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.__downloadNames = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.__downloadNames.push(this.download);
      return originalClick.call(this);
    };
  })()`)
  assert.equal(await evaluate("document.querySelector('.recon-selection').textContent.includes('8 × 8')"), true)
  await evaluate("document.querySelector('.recon-submit').click()")
  await until("!!document.querySelector('.recon-ready')")
  const readyShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(new URL('../.review/reconstruct-ready.png', import.meta.url), Buffer.from(readyShot.data, 'base64'))
  assert.equal(requests, 1)
  assert.equal(await evaluate("!!document.querySelector('.recon-export')"), false)
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.recon-pipeline li')).map(e => e.className).join('|')"), 'is-complete|is-complete|is-current|is-future')
  assert.equal(await evaluate("document.body.innerText.includes('browser-test-token')"), false)
  deferInfer = true
  await evaluate("document.querySelector('.recon-infer').click()")
  for (let attempt = 0; attempt < 100 && !pendingInferRequest; attempt++) await delay(100)
  assert.ok(pendingInferRequest, 'one inference request reaches the backend')
  await evaluate("document.querySelector('a[href=\"/model\"]').click()")
  await until("location.pathname === '/model'")
  assert.equal(await evaluate("document.querySelector('.global-job-status').textContent.includes('PROCESSING')"), true, 'inference remains globally active after SPA navigation')
  await evaluate("document.querySelector('.dash-profile-menu summary').click()")
  await evaluate("Array.from(document.querySelectorAll('.dash-profile-popover button')).find(b => b.textContent.includes('Your profile')).click()")
  await until("document.querySelector('.profile-dialog')?.open")
  assert.equal(await evaluate("document.querySelector('.global-job-status').textContent.includes('PROCESSING')"), true, 'inference remains active with Profile overlay')
  await evaluate("document.querySelector('.profile-dialog-close').click()")
  deferInfer = false
  await send('Fetch.fulfillRequest', { requestId: pendingInferRequest, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(mockMesh).toString('base64') })
  pendingInferRequest = null
  await until("document.querySelector('.global-job-status').textContent.includes('COMPLETED')")
  assert.equal(await evaluate("document.querySelector('.global-job-notice')?.textContent.includes('reconstruction finished')"), true, 'completion is announced off the reconstruction page')
  await evaluate("document.querySelector('a[href=\"/reconstruct\"]').click()")
  await until("location.pathname === '/reconstruct' && !!document.querySelector('.recon-mesh-result')")
  assert.equal(requests, 2)
  assert.equal(await evaluate("window.__reconDb.rows.length"), 1, 'one real persistence row is created')
  assert.equal(await evaluate("window.__reconDb.rows[0].status"), 'completed')
  assert.deepEqual(await evaluate("window.__reconDb.uploads.map(item => item.path.split('/').pop())"), ['source.png', 'stage3.json', 'stage3.obj', 'stage3.glb'])
  await evaluate("document.querySelector('a[href=\"/history\"]').click()")
  await until("location.pathname === '/history'")
  await until("!!document.querySelector('.history-card')")
  assert.equal(await evaluate("document.querySelector('.history-card')?.textContent.includes('Whiteboard')"), true, 'saved reconstruction appears in History')
  await evaluate("document.querySelector('.history-card a').click()")
  await until("location.pathname.startsWith('/reconstructions/')")
  await until("!!document.querySelector('.result-stage-canvas')")
  assert.equal(await evaluate("!!document.querySelector('.result-stage-canvas')"), true, 'saved Stage-3 geometry reopens from its private artifact')
  await viewport(1024)
  assert.equal(await evaluate("document.querySelector('.result-detail-grid .recon-view-panel').getBoundingClientRect().width > 500"), true, 'saved viewer stays usable on a 1024px laptop')
  for (const width of [390, 320]) {
    await viewport(width); await delay(150)
    assert.equal(await evaluate("document.querySelector('.result-detail-grid .recon-view-panel').getBoundingClientRect().top < document.querySelector('.result-detail-meta').getBoundingClientRect().top"), true, `Saved viewer precedes metadata at ${width}px`)
  }
  await viewport(1440)
  await evaluate("document.querySelector('.result-view-tabs [data-view=input]').click()")
  await until("document.querySelector('.source-view img')?.naturalWidth === 8")
  assert.equal(await evaluate("location.pathname.startsWith('/reconstructions/')"), true, 'saved INPUT keeps the result route')
  await evaluate("document.querySelector('.result-view-tabs [data-view=mesh]').click()")
  await until("!!document.querySelector('.result-stage-canvas')")
  await evaluate("document.querySelector('.result-detail-sidebar .recon-export-actions button:first-child').click()")
  await until("window.__downloadNames?.includes('whiteboard-stage3.obj')")
  await evaluate("document.querySelector('.result-detail-sidebar .recon-export-actions button:last-child').click()")
  await until("window.__downloadNames?.includes('whiteboard-stage3.glb')")
  assert.equal(requests, 2, 'reopening and exporting saved assets make zero additional infer calls')
  await evaluate("window.__downloadNames = []")
  await evaluate("document.querySelector('a[href=\"/reconstruct\"]').click()")
  await until("location.pathname === '/reconstruct' && !!document.querySelector('.recon-mesh-result')")
  assert.equal(await evaluate("document.querySelector('.recon-mesh-result').textContent.includes('2,466')"), true)
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.recon-pipeline li')).map(e => e.className).join('|')"), 'is-complete|is-complete|is-complete|is-complete')
  await until("!!document.querySelector('.recon-export')")
  assert.equal(await evaluate("document.querySelector('.recon-pipeline li:last-child small').textContent"), 'AVAILABLE')
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await viewport(width); await delay(250)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No result overflow at ${width}`)
    assert.equal(await evaluate("document.querySelector('.recon-export-actions button').getBoundingClientRect().width > 100"), true)
    if (width <= 390) assert.equal(await evaluate("(() => { const range=document.createRange();range.selectNodeContents(document.querySelector('.dash-header-copy .dash-kicker'));const a=range.getBoundingClientRect(),b=document.querySelector('.global-job-status').getBoundingClientRect();return !(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top) })()"), true, `Mobile job status must not overlap painted page context at ${width}`)
  }
  await viewport(1440)
  assert.equal(await evaluate("Math.abs(document.querySelector('.recon-control-panel').getBoundingClientRect().top - document.querySelector('.recon-view-panel').getBoundingClientRect().top) < 2"), true, 'desktop columns share a top baseline')
  assert.equal(await evaluate("document.querySelector('.recon-control-panel').classList.contains('has-result')"), true, 'completed source controls become compact')
  assert.equal(await evaluate("!!document.querySelector('.recon-view-panel .recon-export')"), true, 'exports stay with the result viewer')
  assert.equal(await evaluate("document.querySelector('.recon-control-panel').getBoundingClientRect().height < 1100"), true, 'completed controls do not create a tall empty companion column')
  assert.equal(await evaluate("document.documentElement.scrollHeight < 1900"), true, 'result fits in a bounded workstation document')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.result-view-tabs button')).fontFamily.includes('mono')"), false, 'primary view tabs use product typography')
  console.log('RESULT_DOCUMENT_GEOMETRY', await evaluate("({scrollHeight:document.documentElement.scrollHeight,left:document.querySelector('.recon-control-panel').getBoundingClientRect().height,viewer:document.querySelector('.recon-view-panel').getBoundingClientRect().height,exportTop:document.querySelector('.recon-export').getBoundingClientRect().top,viewerBottom:document.querySelector('.recon-view-panel').getBoundingClientRect().bottom})"))
  assert.equal(await evaluate("document.querySelector('.recon-export').getBoundingClientRect().top + window.scrollY < 960"), true, 'Exports stay in the first workstation screen on desktop')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.recon-view-panel')).position"), 'static', 'source/result panel remains in document flow')
  console.log('WORKSPACE_LAYOUT', await evaluate(`JSON.stringify(Object.fromEntries(['.recon-workspace','.recon-control-panel','.recon-view-panel','.result-view-wrap','.result-stage-canvas','.result-view-caption','.recon-view-foot'].map(selector => { const el=document.querySelector(selector), r=el.getBoundingClientRect(), s=getComputedStyle(el); return [selector,{height:r.height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,background:s.backgroundColor,minHeight:s.minHeight,alignSelf:s.alignSelf,position:s.position,overflow:s.overflow}]; })))`))
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.recon-workspace')).backgroundColor"), 'rgba(0, 0, 0, 0)', 'Grid must not paint a tall olive filler')
  assert.equal(await evaluate("!!document.querySelector('.recon-volume-note')"), false, 'Healthy TEST fixture has no warning')
  await evaluate("document.querySelector('.recon-view-panel').setAttribute('data-review', 'TEST FIXTURE ? NOT MODEL OUTPUT'); document.querySelector('.recon-view-panel h2').textContent = 'TEST FIXTURE / viewer review'")
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await viewport(width); await delay(350)
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.recon-view-panel')).position"), 'static')
    await evaluate("document.querySelector('.recon-view-panel').scrollIntoView({behavior:'instant', block:'start'})")
    const image = await send('Page.captureScreenshot', { format:'png' })
    await writeFile(new URL(`../.review/stage10-result-${width}.png`, import.meta.url), Buffer.from(image.data, 'base64'))
  }
  await viewport(1440)
  for (const preset of ['front', 'side', 'top', 'iso']) {
    await evaluate(`Array.from(document.querySelectorAll('.result-view-presets button')).find(b => b.textContent.toLowerCase() === '${preset}').click()`)
    await until(`document.querySelector('.result-view-caption').textContent.includes('${preset.toUpperCase()} VIEW')`)
  }
  await evaluate("document.querySelector('.result-reset').click()")
  await evaluate("document.querySelector('.recon-export-actions button:first-child').click()")
  try {
    await until("window.__downloadNames?.includes('whiteboard-stage3.obj')")
  } catch (error) {
    console.log('OBJ_EXPORT_DIAGNOSTIC', await evaluate("({ names: window.__downloadNames, status: document.querySelector('.recon-export-status')?.textContent, disabled: document.querySelector('.recon-export-actions button:first-child')?.disabled })"))
    throw error
  }
  await evaluate("document.querySelector('.recon-export-actions button:last-child').click()")
  await until("window.__downloadNames?.includes('whiteboard-stage3.glb')")
  assert.equal(requests, 2, 'Export must not send another inference request')
  assert.deepEqual(await evaluate('window.__downloadNames'), ['whiteboard-stage3.obj', 'whiteboard-stage3.glb'])
  await evaluate(`(() => {
    const field = document.querySelector('.recon-object-field input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Whiteboard Revised');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await evaluate("document.querySelector('.recon-save-name').click()")
  await until("window.__reconDb.rows[0].object_name === 'Whiteboard Revised'")
  assert.equal(await evaluate("document.body.innerText.includes('browser-test-token')"), false)
  await evaluate("document.querySelector('.result-mode-group button:nth-child(2)').click()")
  assert.equal(await evaluate("document.querySelector('.result-mode-group button:nth-child(2)').classList.contains('is-active')"), true)
  await evaluate("document.querySelector('.result-mode-group button:nth-child(3)').click()")
  assert.equal(await evaluate("document.querySelector('.result-mode-group button:nth-child(3)').getAttribute('aria-pressed')"), 'true')
  await evaluate("document.querySelector('.result-view-tabs [data-view=input]').click()")
  await until("document.querySelector('.recon-view-panel h2')?.textContent === 'Input inspection'")
  assert.equal(await evaluate("location.pathname"), '/reconstruct', 'INPUT stays in the reconstruction workspace')
  await until("document.querySelector('.source-view img')?.naturalWidth === 8")
  assert.equal(await evaluate("(() => { const image = document.querySelector('.source-view img'); return image.complete && image.naturalWidth === 8 && image.naturalHeight === 8 && getComputedStyle(image).objectFit === 'contain' })()"), true, 'INPUT shows the decoded source photograph directly')
  await evaluate("document.querySelector('.result-view-tabs [data-view=mesh]').click()")
  await until("document.querySelector('.recon-view-panel h2')?.textContent === 'Real Stage-3 mesh'")
  await until("!!document.querySelector('.result-stage-canvas canvas')")
  await delay(500)
  assert.equal(await evaluate("(async()=>{const f=await import('/node_modules/.vite/deps/@react-three_fiber.js');return Array.from(f._roots).some(([c,r])=>c.closest('.result-stage-canvas') && r.store.getState().gl.info.render.frame > 1)})()"), true, 'Demand renderer draws settled geometry after Input comparison')
  await evaluate("document.querySelector('.result-fit').click()")
  assert.equal(await evaluate("document.querySelector('.result-mode-group button:first-child').classList.contains('is-active')"), true)
  const nearLine = healthyStage3()
  nearLine.vertices = nearLine.vertices.map(([x,y,z]) => [x,y * 0.02,z * 0.0005])
  mockMesh = JSON.stringify(nearLine)
  await evaluate("document.querySelector('.recon-infer').click()")
  await until("!!document.querySelector('.recon-volume-note')")
  assert.equal(await evaluate("document.querySelector('.recon-export-actions button').disabled"), false, 'Collapsed geometry remains exportable')
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 9;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'replacement.png', {type:'image/png'}));
    const input = document.querySelector('.recon-drop input');
    Object.defineProperty(input, 'files', {configurable:true, value:transfer.files});
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`)
  await until("document.querySelector('.recon-selection')?.textContent.includes('replacement.png')")
  assert.equal(await evaluate("!!document.querySelector('.recon-ready')"), false)
  assert.equal(await evaluate("!!document.querySelector('.recon-export')"), false)
  preflightStatus = 413
  await evaluate("document.querySelector('.recon-submit').click()")
  await until("!!document.querySelector('.recon-inline-error')")
  assert.equal(await evaluate("document.querySelector('.recon-inline-error').textContent.includes('limit')"), true)
  await evaluate("document.querySelector('.recon-selection-head button').click()")
  await until("!document.querySelector('.recon-selection')")
  assert.equal(await evaluate("document.querySelector('.recon-pipeline li').className"), 'is-current')
  await evaluate(`(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['test'], 'wrong.gif', {type:'image/gif'}));
    const input = document.querySelector('.recon-drop input');
    Object.defineProperty(input, 'files', {configurable:true, value:transfer.files});
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`)
  await until("document.querySelector('.recon-inline-error')?.textContent.includes('Unsupported')")
  await evaluate(`(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.png', {type:'image/png'}));
    const input = document.querySelector('.recon-drop input');
    Object.defineProperty(input, 'files', {configurable:true, value:transfer.files});
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`)
  await until("document.querySelector('.recon-inline-error')?.textContent.includes('10 MB')")
  await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 6; canvas.height = 5;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'dropped.png', {type:'image/png'}));
    document.querySelector('.recon-drop').dispatchEvent(new DragEvent('drop', {bubbles:true, dataTransfer:transfer}));
  })()`)
  await until("document.querySelector('.recon-selection')?.textContent.includes('dropped.png')")
  await evaluate("window.__xssFired=false; window.__reconDb.rows.forEach(row => row.object_name='<img src=x onerror=window.__xssFired=true>'); document.querySelector('.dash-sidebar a[href=\"/history\"]').click()")
  await until("location.pathname === '/history' && !!document.querySelector('.history-card')")
  assert.equal(await evaluate("document.querySelector('.history-card-main h2').textContent.includes('<img')"), true, 'untrusted object name remains text')
  assert.equal(await evaluate("document.querySelector('.history-card-main h2 img') === null && window.__xssFired === false"), true, 'object-name markup is never executed')
  authenticated = false
  await visit('/reconstruct', '.auth-form')
  assert.equal(await evaluate('location.pathname'), '/login')
  console.log('PASS preflight UI, error, clear, reduced motion, protected redirect')
  assert.deepEqual(errors, [])
} finally {
  await send('Page.close').catch(() => {})
  socket.close()
}
