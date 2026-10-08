import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyProcessing, STALE_AFTER_MS } from '../src/jobs/stale.js'
import { heartbeatReconstruction, interruptStaleReconstruction } from '../src/lib/reconstructions.js'

const OWNER = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'
const now = Date.parse('2026-10-06T12:00:00Z')

test('five-minute stale rule never interrupts a matching live browser job', () => {
  assert.equal(STALE_AFTER_MS, 5 * 60_000)
  for (const age of [20_000, 180_000, STALE_AFTER_MS - 1]) {
    assert.equal(classifyProcessing({id:ID,status:'processing',updated_at:new Date(now-age).toISOString()}, null, now), 'unconfirmed')
  }
  assert.equal(classifyProcessing({id:ID,status:'processing',updated_at:new Date(now-STALE_AFTER_MS).toISOString()}, null, now), 'stale')
  assert.equal(classifyProcessing({id:ID,status:'processing',updated_at:new Date(now-900_000).toISOString()}, ID, now), 'live')
  assert.equal(classifyProcessing({id:ID,status:'completed',updated_at:new Date(now-900_000).toISOString()}, null, now), 'terminal')
})

function fakeClient(returnedRow = null) {
  const calls = []
  const query = {
    update(value) { calls.push(['update',value]); return this },
    eq(field,value) { calls.push(['eq',field,value]); return this },
    lt(field,value) { calls.push(['lt',field,value]); return this },
    select() { return this },
    async maybeSingle() { return {data:returnedRow,error:null} },
  }
  const client = {auth:{getUser:async()=>({data:{user:{id:OWNER}}})},from(table){calls.push(['from',table]);return query}}
  return {client,calls}
}

test('heartbeat updates only an owned row that is still processing', async () => {
  const {client,calls}=fakeClient({id:ID,status:'processing'})
  await heartbeatReconstruction(ID,{client})
  assert.deepEqual(calls.find(([op])=>op==='update'),['update',{status:'processing'}])
  assert.ok(calls.some(([op,key,value])=>op==='eq'&&key==='status'&&value==='processing'))
  assert.ok(calls.some(([op,key,value])=>op==='eq'&&key==='user_id'&&value===OWNER))
})

test('stale update is conditional on old timestamp and cannot overwrite completed work', async () => {
  const cutoff=new Date(now-STALE_AFTER_MS).toISOString()
  const {client,calls}=fakeClient(null)
  assert.equal(await interruptStaleReconstruction(ID,cutoff,{client}),null)
  assert.deepEqual(calls.find(([op])=>op==='update'),['update',{status:'interrupted'}])
  assert.deepEqual(calls.find(([op])=>op==='lt'),['lt','updated_at',cutoff])
  assert.ok(calls.some(([op,key,value])=>op==='eq'&&key==='status'&&value==='processing'))
})
