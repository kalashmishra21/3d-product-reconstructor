import assert from 'node:assert/strict'

const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const origin = 'http://127.0.0.1:5173'
const browserInfo = await (await fetch(`${debug}/json/version`)).json()
const browser = new WebSocket(browserInfo.webSocketDebuggerUrl)
await new Promise(resolve => browser.addEventListener('open', resolve, { once: true }))

let nextId = 0
const pending = new Map()
browser.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id && pending.has(message.id)) {
    const callback = pending.get(message.id)
    pending.delete(message.id)
    callback(message)
  }
})
const sendBrowser = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
  browser.send(JSON.stringify({ id, method, params }))
})
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function inspectTarget(targetId, expectAuthenticated) {
  let pageInfo
  for (let attempt = 0; attempt < 30; attempt++) {
    pageInfo = (await (await fetch(`${debug}/json/list`)).json()).find(tab => tab.id === targetId)
    if (pageInfo?.webSocketDebuggerUrl) break
    await pause(100)
  }
  assert.ok(pageInfo?.webSocketDebuggerUrl)
  const page = new WebSocket(pageInfo.webSocketDebuggerUrl)
  await new Promise(resolve => page.addEventListener('open', resolve, { once: true }))
  let pageId = 0
  const pagePending = new Map()
  const visited = []
  page.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pagePending.has(message.id)) {
      const callback = pagePending.get(message.id)
      pagePending.delete(message.id)
      callback(message)
    }
    if (message.method === 'Page.frameNavigated' && message.params.frame.parentId === undefined) {
      visited.push(message.params.frame.url)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++pageId
    pagePending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
    page.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value
  try {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url: origin })
    for (let attempt = 0; attempt < 80 && !await evaluate('!!document.querySelector(".header-explore")'); attempt++) await pause(100)
    assert.ok(await evaluate('!!document.querySelector(".header-explore")'), 'landing CTA exists')
    assert.equal(await evaluate('document.querySelector(".site-header nav a[href=\\"/login\\"]") === null'), true)
    if (expectAuthenticated) {
      let focusReached = false
      for (let attempt = 0; attempt < 12; attempt++) {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        if (await evaluate('document.activeElement?.classList.contains("header-explore")')) {
          focusReached = true
          break
        }
      }
      assert.equal(focusReached, true, 'Enter studio is reachable by keyboard')
      assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'), true,
        'focused Enter studio has a visible outline')
    }
    await evaluate('document.querySelector(".header-explore").click()')
    const expectedPath = expectAuthenticated ? '/dashboard' : '/login'
    for (let attempt = 0; attempt < 100 && await evaluate('location.pathname') !== expectedPath; attempt++) await pause(100)
    assert.equal(await evaluate('location.pathname'), expectedPath)
    if (expectAuthenticated) {
      assert.equal(visited.some(url => url.includes('/login')), false, 'signed-in CTA never flashes login')
    } else {
      assert.equal(await evaluate('window.history.state?.usr?.from?.pathname'), '/dashboard', 'login keeps safe workspace return')
    }
  } finally {
    page.close()
  }
}

let privateContext
let signedTarget
let privateTarget
try {
  signedTarget = (await sendBrowser('Target.createTarget', { url: 'about:blank' })).targetId
  await inspectTarget(signedTarget, true)
  privateContext = (await sendBrowser('Target.createBrowserContext')).browserContextId
  privateTarget = (await sendBrowser('Target.createTarget', { url: 'about:blank', browserContextId: privateContext })).targetId
  await inspectTarget(privateTarget, false)
  console.log('PASS Enter studio routes signed-in and signed-out visitors without a duplicate Sign in link')
} finally {
  if (signedTarget) await sendBrowser('Target.closeTarget', { targetId: signedTarget })
  if (privateTarget) await sendBrowser('Target.closeTarget', { targetId: privateTarget })
  if (privateContext) await sendBrowser('Target.disposeBrowserContext', { browserContextId: privateContext })
  browser.close()
}
