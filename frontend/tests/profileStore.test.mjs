import test from 'node:test'
import assert from 'node:assert/strict'
import { loadProfile, saveProfile } from '../src/lib/profile.js'

const ID = '11111111-1111-4111-8111-111111111111'
const calls = []
const query = {
  select() { calls.push('select'); return this },
  update(value) { calls.push(value); return this },
  eq() { return this },
  maybeSingle: async () => ({ data: { id: ID, display_name: 'Chair Maker' }, error: null }),
}
const client = { from(table) { calls.push(table); return query }, auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) } }

test('load and save own private display name only', async () => {
  assert.equal((await loadProfile(ID, { client })).display_name, 'Chair Maker')
  await saveProfile(ID, { display_name: 'Studio', email: 'ignore@example.com' }, { client })
  assert.deepEqual(calls.find((call) => typeof call === 'object'), { display_name: 'Studio' })
})
