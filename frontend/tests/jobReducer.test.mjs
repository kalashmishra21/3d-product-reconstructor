import test from 'node:test'
import assert from 'node:assert/strict'
import { initialJobState, jobReducer } from '../src/jobs/jobReducer.js'
import { runReconstruction, retrySave } from '../src/jobs/runJob.js'

const ID = '22222222-2222-4222-8222-222222222222'
const USER = '11111111-1111-4111-8111-111111111111'
const mesh = { status: 'complete', model: 'Pixel2Mesh', stage: 3, vertices_count: 2466, faces_count: 4928, latency_ms: 1000,
  vertices: Array.from({ length: 2466 }, (_, i) => [i / 1000, 0, 0]),
  faces: Array.from({ length: 4928 }, (_, i) => [i % 2464, i % 2464 + 1, i % 2464 + 2]) }
const file = { name: 'chair.png', type: 'image/png', size: 1000 }
const snapshot = { userId: USER, file, objectName: 'Chair', verified: { width: 224, height: 224, size_bytes: 1000 } }

test('reducer has explicit phases and rejects stale completions', () => {
  const selected = jobReducer(initialJobState, { type: 'selected', runId: 1, selection: { file }, objectName: 'Chair' })
  const processing = jobReducer(selected, { type: 'processing', runId: 1, id: ID })
  assert.equal(processing.phase, 'processing')
  assert.equal(jobReducer(processing, { type: 'completed', runId: 0, mesh }).phase, 'processing')
  assert.equal(jobReducer(processing, { type: 'completed', runId: 1, mesh }).phase, 'completed')
  assert.equal(jobReducer(processing, { type: 'processing', runId: 1, id: ID }).phase, 'processing')
  assert.equal(jobReducer(processing, { type: 'selected', runId: 2, selection: { file }, objectName: 'New' }).mesh, null)
})

test('one job uploads one source, invokes inference once, and persists raw artifacts in order', async () => {
  const calls = []
  const services = {
    createReconstruction: async () => { calls.push('create'); return { id: ID } },
    uploadSource: async () => { calls.push('source'); return `${USER}/${ID}/source.png` },
    patchReconstruction: async (_id, patch) => { calls.push(`patch:${patch.status || 'source'}`); return { id: ID, ...patch } },
    inferImage: async () => { calls.push('infer'); return mesh },
    validateMesh: () => '', diagnoseMesh: () => ({ degenerate: false }),
    serializeArtifactSet: async () => { calls.push('serialize'); return { json: { blob: new Blob(['json']) }, obj: { blob: new Blob(['obj']), sizeBytes: 3 }, glb: { blob: new Blob(['glb']), sizeBytes: 3 } } },
    uploadArtifactSet: async () => { calls.push('artifacts'); return { json: `${USER}/${ID}/stage3.json`, obj: `${USER}/${ID}/stage3.obj`, glb: `${USER}/${ID}/stage3.glb` } },
  }
  const events = []
  const result = await runReconstruction(snapshot, services, { onEvent: (event) => events.push(event.type) })
  assert.deepEqual(calls, ['create', 'source', 'patch:source', 'infer', 'serialize', 'artifacts', 'patch:completed'])
  assert.equal(result.mesh, mesh)
  assert.ok(events.includes('processing') && events.includes('completed'))
})

test('inference failure marks row failed without a placeholder mesh', async () => {
  const calls = []
  const services = {
    createReconstruction: async () => ({ id: ID }), uploadSource: async () => `${USER}/${ID}/source.png`,
    patchReconstruction: async (_id, patch) => { calls.push(patch); return patch },
    inferImage: async () => { throw new Error('worker trace must not be stored') },
  }
  await assert.rejects(runReconstruction(snapshot, services, { onEvent() {} }), /worker trace/)
  assert.equal(calls.at(-1).status, 'failed')
  assert.ok(!JSON.stringify(calls.at(-1)).includes('worker trace'))
})

test('malformed model output is an inference failure and never persists artifacts', async () => {
  const calls = []
  const services = {
    createReconstruction: async () => ({ id: ID }),
    uploadSource: async () => `${USER}/${ID}/source.png`,
    patchReconstruction: async (_id, patch) => { calls.push(patch); return patch },
    inferImage: async () => ({ vertices: [] }),
    validateMesh: () => 'invalid geometry',
    serializeArtifactSet: async () => { throw new Error('must not serialize') },
  }
  const events = []
  await assert.rejects(runReconstruction(snapshot, services, { onEvent: (event) => events.push(event) }), /invalid mesh/)
  assert.equal(calls.at(-1).status, 'failed')
  assert.equal(events.at(-1).kind, 'inference')
  assert.equal(events.at(-1).mesh, undefined)
})

test('row creation failure produces a safe visible failure without inference', async () => {
  const events = []
  let inferCount = 0
  await assert.rejects(runReconstruction(snapshot, {
    createReconstruction: async () => { throw new Error('private database detail') },
    inferImage: async () => { inferCount++ },
  }, { onEvent: (event) => events.push(event) }), /private database detail/)
  assert.equal(inferCount, 0)
  assert.equal(events.at(-1)?.type, 'failed')
  assert.ok(!events.at(-1)?.message.includes('private database detail'))
})

test('retry-save uses existing mesh and row without another inference', async () => {
  let inferenceCount = 0
  const services = {
    inferImage: async () => { inferenceCount++; throw new Error('must not run') },
    validateMesh: () => '', diagnoseMesh: () => ({ degenerate: true }),
    serializeArtifactSet: async () => ({ json: { blob: new Blob(['x']) }, obj: { blob: new Blob(['x']), sizeBytes: 1 }, glb: { blob: new Blob(['x']), sizeBytes: 1 } }),
    uploadArtifactSet: async () => ({ json: 'a', obj: 'b', glb: 'c' }),
    patchReconstruction: async (_id, patch) => patch,
  }
  const result = await retrySave(snapshot, mesh, ID, services, { onEvent() {} })
  assert.equal(result.status, 'low_volume')
  assert.equal(inferenceCount, 0)
})

test('persistence failure can return to persisting and finish without losing the mesh', () => {
  const selected = jobReducer(initialJobState, { type: 'selected', runId: 1, selection: { file }, objectName: 'Chair' })
  const processing = jobReducer(selected, { type: 'processing', runId: 1, id: ID })
  const saving = jobReducer(processing, { type: 'persisting', runId: 1, mesh })
  const failed = jobReducer(saving, { type: 'failed', runId: 1, kind: 'persistence', message: 'Retry save', mesh })
  const retrying = jobReducer(failed, { type: 'persisting', runId: 1, mesh })
  assert.equal(retrying.phase, 'persisting')
  assert.equal(jobReducer(retrying, { type: 'completed', runId: 1, mesh }).phase, 'completed')
})
