import test from 'node:test'
import assert from 'node:assert/strict'
import { listReconstructions } from '../src/lib/reconstructions.js'

const USER = '11111111-1111-4111-8111-111111111111'

function clientWithTrace() {
  const calls = []
  const query = {
    select(columns) { calls.push(['select', columns]); return this },
    eq(field, value) { calls.push(['eq', field, value]); return this },
    in(field, values) { calls.push(['in', field, values]); return this },
    or(expression) { calls.push(['or', expression]); return this },
    order(field, options) { calls.push(['order', field, options]); return this },
    range(first, last) { calls.push(['range', first, last]); return Promise.resolve({ data: [], error: null }) },
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from(table) { calls.push(['from', table]); return query } }
  return { client, calls }
}

test('History queries private metadata newest first without downloading mesh JSON', async () => {
  const { client, calls } = clientWithTrace()
  assert.deepEqual(await listReconstructions({ userId: USER }, { client }), [])
  assert.deepEqual(calls.find(([action]) => action === 'from'), ['from', 'reconstructions'])
  assert.deepEqual(calls.find(([action]) => action === 'order'), ['order', 'created_at', { ascending: false }])
  assert.deepEqual(calls.find(([action]) => action === 'range'), ['range', 0, 23])
  const columns = calls.find(([action]) => action === 'select')[1].split(',')
  assert.equal(columns.includes('vertices'), false)
  assert.equal(columns.includes('faces'), false)
})

test('History status and safe search apply before pagination', async () => {
  const { client, calls } = clientWithTrace()
  await listReconstructions({ userId: USER, status: 'failed', search: 'chair%, table', limit: 10 }, { client })
  assert.deepEqual(calls.find(([action]) => action === 'in'), ['in', 'status', ['failed', 'interrupted']])
  assert.equal(calls.find(([action]) => action === 'or')[1], 'object_name.ilike.%chair table%,source_filename.ilike.%chair table%')
  assert.ok(calls.findIndex(([action]) => action === 'or') < calls.findIndex(([action]) => action === 'range'))
  assert.deepEqual(calls.find(([action]) => action === 'range'), ['range', 0, 9])
})
