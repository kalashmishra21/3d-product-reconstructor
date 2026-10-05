import test from 'node:test'
import assert from 'node:assert/strict'
import { createReconstruction, patchReconstruction, getReconstruction, listReconstructions } from '../src/lib/reconstructions.js'

const A = '11111111-1111-4111-8111-111111111111'

function fakeClient() {
  const calls = []
  const row = { id: '22222222-2222-4222-8222-222222222222', user_id: A, status: 'processing' }
  const query = {
    insert(value) { calls.push(['insert', value]); return this },
    update(value) { calls.push(['update', value]); return this },
    select(columns, options) { calls.push(['select', columns, options]); return this },
    eq(key, value) { calls.push(['eq', key, value]); return this },
    in(key, value) { calls.push(['in', key, value]); return this },
    or(value) { calls.push(['or', value]); return this },
    order(key, options) { calls.push(['order', key, options]); return this },
    range(start, end) { calls.push(['range', start, end]); return this },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve({ data: row, error: null }) },
    then(resolve) { return Promise.resolve({ data: [row], error: null }).then(resolve) },
  }
  return { calls, client: { from(table) { calls.push(['from', table]); return query }, auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) } } }
}

test('create accepts only frozen source metadata and authenticates ownership', async () => {
  const { client, calls } = fakeClient()
  await createReconstruction({ userId: A, objectName: 'Chair', filename: 'chair.png', mime: 'image/png', width: 224, height: 224, sizeBytes: 1024 }, { client })
  assert.equal(calls[0][1], 'reconstructions')
  assert.deepEqual(calls.find(([method]) => method === 'insert')[1], {
    user_id: A, object_name: 'Chair', source_filename: 'chair.png', source_mime: 'image/png', source_width: 224,
    source_height: 224, source_size_bytes: 1024, status: 'processing',
  })
})

test('patch allowlists fields and conditions terminal update', async () => {
  const { client, calls } = fakeClient()
  await patchReconstruction('22222222-2222-4222-8222-222222222222', { status: 'failed', error_message: 'Try again.', user_id: 'evil' }, { client, expectedStatus: 'processing' })
  assert.deepEqual(calls.find(([method]) => method === 'update')[1], { status: 'failed', error_message: 'Try again.' })
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'status' && call[2] === 'processing'))
})

test('invalid result ID is safe and never sent to Supabase', async () => {
  const { client, calls } = fakeClient()
  assert.equal(await getReconstruction('../other-user', { client }), null)
  assert.equal(calls.length, 0)
})

test('list searches before pagination and selects metadata only', async () => {
  const { client, calls } = fakeClient()
  await listReconstructions({ userId: A, status: 'failed', search: 'chair', offset: 24, limit: 24 }, { client })
  const methods = calls.map(([method]) => method)
  assert.ok(methods.indexOf('or') < methods.indexOf('range'))
  assert.ok(methods.indexOf('in') < methods.indexOf('range'))
  const columns = calls.find(([method]) => method === 'select')[1].split(',')
  assert.ok(!columns.includes('vertices'))
  assert.ok(!columns.includes('faces'))
  assert.deepEqual(calls.find(([method]) => method === 'range').slice(1), [24, 47])
})
