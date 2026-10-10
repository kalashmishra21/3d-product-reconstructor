import test from 'node:test'
import assert from 'node:assert/strict'
import { runReconstruction } from '../src/jobs/runJob.js'

const rowId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const snapshot = {
  userId,
  file: { name: 'chair.png', type: 'image/png', size: 1000 },
  objectName: 'Chair',
  verified: { width: 224, height: 224, size_bytes: 1000 },
}

async function settlesWithin(promise, milliseconds = 1000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Job remained processing')), milliseconds) }),
    ])
  } finally { clearTimeout(timer) }
}

test('a missing source-path PATCH response fails visibly without starting inference', async () => {
  const events = []
  const patches = []
  let inferenceCalls = 0
  const services = {
    createReconstruction: async () => ({ id: rowId }),
    uploadSource: async () => `${userId}/${rowId}/source.png`,
    patchReconstruction: async (_id, patch) => {
      patches.push(patch)
      if (patch.source_path) return new Promise(() => {})
      return { id: rowId, ...patch }
    },
    inferImage: async () => { inferenceCalls += 1 },
  }

  await assert.rejects(
    settlesWithin(runReconstruction(snapshot, services, {
      sourcePatchTimeoutMs: 20,
      failurePatchTimeoutMs: 20,
      onEvent: event => events.push(event),
    })),
    /Source confirmation timed out/,
  )
  assert.equal(inferenceCalls, 0)
  assert.equal(patches.at(-1)?.status, 'failed')
  assert.equal(events.at(-1)?.type, 'failed')
  assert.equal(events.at(-1)?.kind, 'database')
  assert.match(events.at(-1)?.message, /source image/i)
})

test('a missing failure-status PATCH response cannot hide the source error', async () => {
  const events = []
  const services = {
    createReconstruction: async () => ({ id: rowId }),
    uploadSource: async () => `${userId}/${rowId}/source.png`,
    patchReconstruction: async (_id, patch) => {
      if (patch.source_path) throw new Error('source update lost')
      return new Promise(() => {})
    },
  }

  await assert.rejects(
    settlesWithin(runReconstruction(snapshot, services, {
      sourcePatchTimeoutMs: 20,
      failurePatchTimeoutMs: 20,
      onEvent: event => events.push(event),
    })),
    /source update lost/,
  )
  assert.equal(events.at(-1)?.type, 'failed')
  assert.equal(events.at(-1)?.kind, 'database')
})
