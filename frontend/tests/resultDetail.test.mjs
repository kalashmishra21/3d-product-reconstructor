import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSavedResult, refreshSavedSource } from '../src/lib/resultDetail.js'

const id = '22222222-2222-4222-8222-222222222222'
const row = { id, status: 'low_volume', source_path: 'owner/result/source.png', mesh_json_path: 'owner/result/stage3.json' }

test('saved result loads private source and raw mesh without calling inference', async () => {
  const calls = []
  const mesh = { model: 'Pixel2Mesh', stage: 3, vertices_count: 2466, faces_count: 4928 }
  const result = await loadSavedResult(id, {
    async getReconstruction(value) { calls.push(['row', value]); return row },
    async signedImageUrl(bucket, path) { calls.push(['sign', bucket, path]); return 'https://example.invalid/private-source' },
    async downloadPrivate(bucket, path) { calls.push(['download', bucket, path]); return new Blob(['mesh']) },
    async parseArtifact(blob) { calls.push(['parse', await blob.text()]); return mesh },
  })
  assert.deepEqual(calls.map(([action]) => action), ['row', 'sign', 'download', 'parse'])
  assert.equal(result.mesh, mesh)
  assert.equal(result.sourceUrl, 'https://example.invalid/private-source')
})

test('missing or unowned result is a safe Not Found without artifact access', async () => {
  let artifactCalls = 0
  const result = await loadSavedResult(id, {
    async getReconstruction() { return null },
    async signedImageUrl() { artifactCalls++; throw Error('Must not run') },
    async downloadPrivate() { artifactCalls++; throw Error('Must not run') },
  })
  assert.equal(result.row, null)
  assert.equal(artifactCalls, 0)
})

test('corrupt private geometry remains unavailable without losing the saved row', async () => {
  const result = await loadSavedResult(id, {
    async getReconstruction() { return row },
    async signedImageUrl() { return 'https://example.invalid/private-source' },
    async downloadPrivate() { return new Blob(['bad']) },
    async parseArtifact() { throw new Error('Invalid mesh artifact') },
  })
  assert.equal(result.row, row)
  assert.equal(result.mesh, null)
  assert.equal(result.artifactError, true)
})

test('refreshing an expiring source URL preserves loaded raw mesh without inference', async () => {
  const mesh = { vertices: [[1, 2, 3]] }
  const saved = { row, mesh, sourceUrl: 'old', sourceError: false }
  const refreshed = await refreshSavedSource(saved, {
    signedImageUrl: async (bucket, path) => {
      assert.equal(bucket, 'reconstruction-artifacts')
      assert.equal(path, row.source_path)
      return 'new'
    },
  })
  assert.equal(refreshed.sourceUrl, 'new')
  assert.equal(refreshed.mesh, mesh)
  assert.equal(refreshed.row, row)
})
