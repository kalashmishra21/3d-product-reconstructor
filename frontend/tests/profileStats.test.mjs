import test from 'node:test'
import assert from 'node:assert/strict'
import { getProfileStats, listRecentReconstructions } from '../src/lib/reconstructions.js'

const USER = '11111111-1111-4111-8111-111111111111'
function fakeClient() {
  const calls = []
  const query = {
    select(columns, options) { calls.push(['select', columns, options]); return this },
    eq(key, value) { calls.push(['eq', key, value]); return this },
    order(key, options) { calls.push(['order', key, options]); return this },
    range(start, end) { calls.push(['range', start, end]); return this },
    then(resolve) {
      const status = calls.filter(([method, key]) => method === 'eq' && key === 'status').at(-1)?.[2]
      const result = calls.at(-1)?.[0] === 'range'
        ? { data: [{ id: 'r1', object_name: 'Chair', status: 'low_volume' }], error: null }
        : { count: ({ completed: 2, low_volume: 1, failed: 1 })[status] ?? 4, error: null }
      return Promise.resolve(result).then(resolve)
    },
  }
  return { calls, client: {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from(table) { calls.push(['from', table]); return query },
  } }
}

test('Profile stats make four owner-scoped exact head count requests', async () => {
  const { client, calls } = fakeClient()
  assert.deepEqual(await getProfileStats(USER, { client }), { total: 4, completed: 2, lowVolume: 1, failed: 1 })
  assert.equal(calls.filter(([method]) => method === 'from').length, 4)
  assert.equal(calls.filter(([method]) => method === 'select' && calls.length && true).length, 4)
  assert.ok(calls.filter(([method]) => method === 'select').every(([,columns,options]) => columns === 'id' && options.count === 'exact' && options.head === true))
  assert.equal(calls.filter(([method,key]) => method === 'eq' && key === 'user_id').length, 4)
  assert.deepEqual(calls.filter(([method,key]) => method === 'eq' && key === 'status').map(([, ,value]) => value), ['completed','low_volume','failed'])
})

test('Profile recent activity fetches only three newest metadata rows', async () => {
  const { client, calls } = fakeClient()
  const rows = await listRecentReconstructions(USER, 3, { client })
  assert.equal(rows.length, 1)
  const columns = calls.find(([method]) => method === 'select')[1]
  assert.ok(columns.includes('object_name'))
  assert.ok(!columns.includes('mesh_json_path'))
  assert.ok(!columns.includes('vertices_count'))
  assert.deepEqual(calls.find(([method]) => method === 'range').slice(1), [0,2])
  assert.ok(calls.some(([method,key,options]) => method === 'order' && key === 'created_at' && options.ascending === false))
})
