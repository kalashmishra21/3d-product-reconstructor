import assert from 'node:assert/strict'

const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const base = 'http://127.0.0.1:5173'
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let nextId = 0
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result)
    pending.delete(message.id)
  }
})
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++nextId
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const navigate = async path => {
  await send('Page.navigate', { url: base + path })
  for (let tries = 0; tries < 100; tries++) {
    if (await evaluate('document.readyState === "complete" && !!document.querySelector("#main-content")')) return
    await pause(100)
  }
  throw new Error(`Timed out opening ${path}`)
}
const setTheme = async theme => {
  if (await evaluate('document.documentElement.dataset.theme') !== theme) {
    await evaluate('document.querySelector(".theme-toggle").click()')
    await pause(100)
  }
}
const geometry = async selector => evaluate(`(() => {
  const element = document.querySelector(${JSON.stringify(selector)})
  if (!element) return null
  const box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return { width:box.width, height:box.height, radius:parseFloat(style.borderTopLeftRadius), visible:box.width > 0 && box.height > 0, background:style.backgroundColor }
})()`)

try {
  await send('Page.enable')
  for (const theme of ['forest', 'ivory']) {
    for (const width of [1440, 1280, 1024, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      await navigate('/')
      await setTheme(theme)
      const capsule = await geometry('.landing-nav-capsule')
      assert.ok(capsule, `${theme} ${width}: one landing navigation capsule exists`)
      assert.ok(capsule.radius >= Math.min(capsule.height / 2, 24), `${theme} ${width}: capsule is pill-shaped`)
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.landing-nav-capsule a')).map(a => a.textContent.trim().replace(/\\s+/g, ' '))`),
        ['The process', 'Project status', 'Enter studio'])
      assert.equal(await evaluate('document.querySelector(".landing-nav-capsule a[href=\\"/login\\"]") === null'), true,
        `${theme} ${width}: duplicate Sign in navigation is absent`)
      assert.equal(await evaluate(`(() => {
        const shell = document.querySelector('.site-header--landing')
        const surface = document.querySelector('.landing-liquid-surface')
        const style = getComputedStyle(surface)
        return getComputedStyle(shell).backgroundColor === 'rgba(0, 0, 0, 0)'
          && style.backgroundImage !== 'none'
          && getComputedStyle(surface, '::before').content !== 'none'
          && getComputedStyle(surface, '::after').content !== 'none'
      })()`), true, `${theme} ${width}: layered translucent glass is visible`)
      assert.ok(await evaluate('document.querySelector(".landing-nav-capsule .theme-toggle") !== null'))
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${theme} ${width}: landing has no horizontal overflow`)
      assert.equal((await geometry('.landing-nav-capsule .header-explore')).visible, true, `${theme} ${width}: Enter studio remains visible`)
      const actionContrast = await evaluate(`(() => {
        const style = getComputedStyle(document.querySelector('.landing-nav-capsule .header-explore'))
        const luminance = color => {
          const channels = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(value => {
            const component = value / 255
            return component <= .04045 ? component / 12.92 : ((component + .055) / 1.055) ** 2.4
          })
          return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
        }
        const foreground = luminance(style.color)
        const background = luminance(style.backgroundColor)
        return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
      })()`)
      assert.ok(actionContrast >= 4.5, `${theme} ${width}: Enter studio text has readable contrast (${actionContrast})`)

      await navigate('/dashboard')
      await setTheme(theme)
      for (let tries = 0; tries < 100 && !await evaluate('document.querySelector(".dash-sidebar") !== null'); tries++) await pause(100)
      assert.ok(await evaluate('document.querySelector(".dash-sidebar") !== null'), 'Signed-in workspace review session required')
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${theme} ${width}: workspace has no horizontal overflow`)
      const workspaceTheme = await geometry('.dash-header-controls > .theme-toggle')
      assert.ok(workspaceTheme.radius >= workspaceTheme.height / 2 - 1, `${theme} ${width}: workspace theme is a glass pill`)
      if (width >= 768) {
        for (const selector of ['.dash-navigation a[aria-current="page"]', '.dash-sidebar-user', '.dash-signout', '.dash-sidebar-collapse']) {
          const control = await geometry(selector)
          assert.ok(control.radius >= Math.min(control.height / 2 - 1, 20), `${theme} ${width}: ${selector} uses pill styling`)
          if (selector === '.dash-signout') assert.notEqual(control.background, 'rgba(0, 0, 0, 0)', `${theme} ${width}: sign out has a visible glass surface`)
        }
      }
    }
  }
  console.log('PASS Stage 12 final landing/workspace pill layout in both themes at six widths')
} finally {
  socket.close()
  await fetch(`${debug}/json/close/${target.id}`)
  await pause(100)
}
