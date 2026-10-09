import assert from 'node:assert/strict'
const debug='http://127.0.0.1:9230'
const target=await(await fetch(debug+'/json/new?http://127.0.0.1:5173/history',{method:'PUT'})).json()
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let id=0;const pending=new Map();ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id)}})
const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try {
 for(let i=0;i<100&&!await ev(`!!document.querySelector('.dash-profile-menu')`);i++)await pause(100)
 assert.ok(await ev(`!!document.querySelector('.dash-profile-menu')`),'Signed-in review session required')
 for(const theme of ['forest','ivory']) {
  if(await ev('document.documentElement.dataset.theme')!==theme){await ev(`document.querySelector('.theme-toggle').click()`);await pause(100)}
  for(const width of [1440,1280,1024,768,390,320]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(200)
   const rect=await ev(`['.theme-toggle','.dash-profile-menu'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})`)
   assert.ok(Math.abs(rect[0].y-rect[1].y)<=8,`${theme} ${width}: theme/account offset ${Math.abs(rect[0].y-rect[1].y)}`)
   assert.ok(rect[0].x+rect[0].width<=rect[1].x,`${theme} ${width}: controls overlap`)
   assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false)
  }
 }
 console.log('PASS both themes: header alignment, no overlap/overflow at six widths')
} finally {ws.close();await fetch(debug+'/json/close/'+target.id)}
