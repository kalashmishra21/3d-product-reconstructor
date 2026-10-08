import test from 'node:test'
import assert from 'node:assert/strict'
import { signedImageUrl, downloadPrivate, removeObjects } from '../src/lib/storage.js'
import { validateAvatar } from '../src/profile/avatar.js'
import { getReconstruction } from '../src/lib/reconstructions.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
function fakeClient() {
  const calls = []
  return { calls, client: { storage: { from(bucket) {
    calls.push(['bucket', bucket])
    return {
      async createSignedUrl(path) { calls.push(['sign', path]); return { data: { signedUrl: 'https://example.invalid/signed' }, error: null } },
      async download(path) { calls.push(['download', path]); return { data: new Blob(), error: null } },
      async remove(paths) { calls.push(['remove', paths]); return { data: [], error: null } },
    }
  } }, auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) }, from() { calls.push(['query']); return this } } }
}

test('private file APIs reject suffixes, traversal, and bucket/path confusion before network access', async () => {
  const { client, calls } = fakeClient()
  const invalid = [`${A}/${B}.png/extra`, `${A}/${B}.png%2fextra`, `${A}/${B}/source.png`, `../${A}/${B}.png`]
  for (const path of invalid) await assert.rejects(signedImageUrl('avatars', path, 120, { client }), /path/i)
  await assert.rejects(downloadPrivate('reconstruction-artifacts', `${A}/${B}.png`, { client }), /path/i)
  await assert.rejects(removeObjects('avatars', [`${A}/${B}.png/extra`], { client }), /path/i)
  assert.equal(calls.filter(([kind]) => kind !== 'bucket').length, 0)
})

test('malformed ID never becomes an owner-row query', async () => {
  const { client, calls } = fakeClient()
  assert.equal(await getReconstruction(`${B}/../${A}`, { client }), null)
  assert.equal(calls.length, 0)
})

test('avatar MIME spoof and oversized payload are rejected before upload', async () => {
  const pngHeader = Uint8Array.from([137,80,78,71,13,10,26,10])
  await assert.rejects(validateAvatar(new File([pngHeader], 'fake.jpg', { type: 'image/jpeg' }), async () => ({width:1,height:1})), /format/i)
  await assert.rejects(validateAvatar(new File([new Uint8Array(3*1024*1024+1)], 'large.png', { type: 'image/png' }), async () => ({width:1,height:1})), /3 MB/)
})
