import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:5173'
const debug = `http://127.0.0.1:${process.env.CDP_PORT || 9224}`
const target = await (await fetch(`${debug}/json/new?about:blank`, {method:'PUT'})).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let id=0;const pending=new Map(),errors=[]
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)})
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try {
 await send('Runtime.enable');await send('Page.enable')
 await send('Page.navigate',{url:base+'/'})
 for(let i=0;i<60&&!await ev(`!!document.querySelector('.theme-toggle')`);i++)await pause(100)
 assert.ok(await ev(`!!document.querySelector('.theme-toggle')`),'Landing exposes an accessible persistent theme control')
 for(const theme of ['forest','ivory']) {
  if(await ev('document.documentElement.dataset.theme')===theme) { await ev(`document.querySelector('.theme-toggle').click()`); await pause(50) }
  await ev(`document.querySelector('.theme-toggle').click()`)
  await pause(100)
  assert.equal(await ev('document.documentElement.dataset.theme'),theme)
  assert.equal(await ev(`localStorage.getItem('reconstruct.theme')`),theme)
  await send('Page.reload');await pause(700)
  assert.equal(await ev('document.documentElement.dataset.theme'),theme)
  for(const width of [1440,1280,1024,768,390,320]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(150)
   assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false,`${theme} ${width}px overflow`)
   assert.ok(await ev(`document.querySelector('.theme-toggle').getBoundingClientRect().width >= 44`),`${theme} ${width}px theme toggle visible`)
  }
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
 assert.equal(await ev(`getComputedStyle(document.querySelector('.theme-toggle')).transitionDuration`),'0s')
 assert.deepEqual(errors,[])
 console.log('PASS Stage12B theme switching, persistence, reduced motion, responsive landing, no runtime errors')
} finally {ws.close();await fetch(`${debug}/json/close/${target.id}`)}
