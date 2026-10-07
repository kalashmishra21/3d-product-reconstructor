import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureProfile, loadProfile, saveProfile } from '../src/lib/profile.js'

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

test('concurrent first-load profile creation ignores duplicate inserts without overwriting a saved name', async () => {
  const calls = []
  let reads = 0
  const query = {
    select() { return this }, eq() { return this },
    upsert(value, options) { calls.push(['upsert', value, options]); return this },
    maybeSingle: async () => ({ data: ++reads === 3 ? { id: ID, display_name: 'Saved name' } : null, error: null }),
  }
  const api = { auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
    from() { return query } }
  const result = await ensureProfile(ID, 'Auth metadata', { client: api })
  assert.equal(result.display_name, 'Saved name')
  assert.equal(reads, 3, 'a conflicting insert should be followed by an owner-scoped read')
  assert.deepEqual(calls[0], ['upsert', { id: ID, display_name: 'Auth metadata' }, { onConflict: 'id', ignoreDuplicates: true }])
})
