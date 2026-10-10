import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = 'http://127.0.0.1:5173'
const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let next = 0, loadSequence = 0
const pending = new Map(), errors = [], inference = []
socket.addEventListener('message', ({ data }) => {
  const event = JSON.parse(data)
  if (event.id && pending.has(event.id)) {
    const entry = pending.get(event.id); pending.delete(event.id)
    event.error ? entry.reject(new Error(event.error.message)) : entry.resolve(event.result)
  }
  if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text)
  if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') errors.push(event.params.args.map(a=>a.value||a.description).join(' '))
  if (event.method === 'Network.requestWillBeSent' && /\/api\/v1\/reconstructions\/infer(?:\?|$)/.test(event.params.request.url)) inference.push(true)
  if (event.method === 'Page.loadEventFired') loadSequence++
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id=++next; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})) })
const evaluate = async expression => { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw new Error(r.exceptionDetails.text); return r.result.value }
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms))
const until = async expression => {for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(150)}throw new Error(`Timed out: ${expression}`)}
async function waitForNextLoad(previousSequence) {
  const deadline = Date.now() + 10000
  while (loadSequence <= previousSequence && Date.now() < deadline) await delay(25)
  assert.ok(loadSequence > previousSequence, 'CDP page load event arrives before post-navigation inspection')
  await until(`document.readyState === 'complete'`)
}
const click = async label => { assert.ok(await evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});b?.click();return !!b})()`),label) }
await mkdir('.review/landing-reference', { recursive: true })
async function screenshot(name) { const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`.review/landing-reference/${name}.png`,Buffer.from(r.data,'base64')) }
try {
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
  const initialLoad = loadSequence
  await send('Page.navigate',{url:`${origin}/`})
  await waitForNextLoad(initialLoad)
  await until(`!!document.querySelector('h1')`)
  assert.equal(await evaluate(`!!document.querySelector('.p-workspace')`),true,'Real landing includes approved Vessel study workstation')
  assert.equal(await evaluate(`document.querySelector('.site-footer a[href="https://github.com/kalashmishra21"]')?.textContent`),'Project by Kalash Mishra')
  await until(`document.querySelectorAll('canvas').length === 2`)
  await evaluate(`(() => {const input=document.querySelector('#topology');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'70');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await until(`document.querySelector('output').textContent === '70%'`)
  await evaluate(`(() => {const input=document.querySelector('#topology');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  for(const theme of ['forest','ivory']) {
    if(await evaluate('document.documentElement.dataset.theme')!==theme) await evaluate(`document.querySelector('.theme-toggle').click()`)
    await until(`document.documentElement.dataset.theme === '${theme}'`)
    for(const width of [1440,1024,390,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
      await evaluate('window.scrollTo(0,0)');await delay(450)
      const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth')
      assert.equal(overflow,false,`${theme} ${width}px overflow`)
      if([1440,390].includes(width)) {await screenshot(`${theme}-landing-${width}`);await evaluate(`document.querySelector('.p-workspace').scrollIntoView()`);await delay(200);await screenshot(`${theme}-workspace-${width}`)}
      console.log(`PASS ${theme} ${width}px`)
    }
  }
  await click('Input');assert.equal(await evaluate(`!!document.querySelector('.p-input-preview svg')`),true)
  await click('Result')
  for(const label of ['Wireframe','Vertices','Solid','FRONT','SIDE','TOP','ISO','Reset view'])await click(label)
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.querySelector('[aria-label="Collapse preview sidebar"]').click()`)
  assert.equal(await evaluate(`!!document.querySelector('.p-workspace.is-collapsed')`),true)
  await evaluate(`document.querySelector('[aria-label="Expand preview sidebar"]').click()`)
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.p-button')).transitionDuration`),'0s')
  await send('Emulation.setEmulatedMedia',{features:[]})
  const reloadSequence = loadSequence
  await send('Page.reload')
  await waitForNextLoad(reloadSequence)
  await until(`document.documentElement.dataset.theme === 'ivory'`)
  assert.equal(inference.length,0)
  assert.deepEqual(errors,[])
  await evaluate('window.scrollTo(0,0)');await send('Page.bringToFront')
  console.log('PASS theme persistence, preview tabs, modes, cameras, sidebar, reduced motion; zero errors/inference')
  console.log(`Review tab: ${target.id}`)
} finally { socket.close() }
