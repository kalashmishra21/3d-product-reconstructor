import test from 'node:test'
import assert from 'node:assert/strict'
import { downloadModelOutputSet, modelOutputPath, uploadModelOutputSet } from '../src/lib/storage.js'

const owner = '11111111-1111-4111-8111-111111111111'
const reconstructionId = '22222222-2222-4222-8222-222222222222'

test('variable geometry keys are owner-scoped and reject traversal', () => {
  assert.equal(modelOutputPath(owner, reconstructionId, 'points'),
    `${owner}/${reconstructionId}/model-v1/global_points.ply`)
  assert.equal(modelOutputPath(owner, reconstructionId, 'mesh'),
    `${owner}/${reconstructionId}/model-v1/visible_surface.obj`)
  assert.equal(modelOutputPath(owner, reconstructionId, 'input', 'image/png'),
    `${owner}/${reconstructionId}/model-v1/input.png`)
  assert.throws(() => modelOutputPath('../other', reconstructionId, 'mesh'), /Invalid storage identity/)
  assert.throws(() => modelOutputPath(owner, reconstructionId, 'input', 'application/octet-stream'), /Unsupported source MIME/)
})

test('uploads exactly input, point cloud and visible mesh to the private bucket', async () => {
  const uploads = []
  const client = { storage: { from(bucket) { return { upload: async (path, body, options) => {
    uploads.push({ bucket, path, body, options })
    return { data: { path }, error: null }
  } } } } }
  const files = { input: new Blob(['rgb'], { type: 'image/png' }), points: new Blob(['ply']), mesh: new Blob(['obj']) }
  const paths = await uploadModelOutputSet(owner, reconstructionId, files, { client })
  assert.deepEqual(Object.keys(paths), ['input', 'points', 'mesh'])
  assert.equal(uploads.length, 3)
  assert.ok(uploads.every((upload) => upload.bucket === 'reconstruction-artifacts'))
  assert.ok(uploads.every((upload) => upload.options.upsert === false))
})

test('history reads use owner-authorized 120 second signed URLs', async (context) => {
  const signedCalls = []
  const client = { storage: { from(bucket) { return { createSignedUrl: async (path, ttl) => {
    signedCalls.push({ bucket, path, ttl })
    return { data: { signedUrl: `https://storage.invalid/${encodeURIComponent(path)}` }, error: null }
  } } } } }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => ({ ok: true, blob: async () => new Blob([url]), options })
  context.after(() => { globalThis.fetch = originalFetch })
  const paths = { input: `${owner}/${reconstructionId}/model-v1/input.png`,
    points: `${owner}/${reconstructionId}/model-v1/global_points.ply`,
    mesh: `${owner}/${reconstructionId}/model-v1/visible_surface.obj` }
  const downloads = await downloadModelOutputSet(paths, { client })
  assert.equal(signedCalls.length, 3)
  assert.ok(signedCalls.every(({ bucket, ttl }) => bucket === 'reconstruction-artifacts' && ttl === 120))
  assert.equal(await downloads.mesh.text().then((value) => value.includes('visible_surface.obj')), true)
})
