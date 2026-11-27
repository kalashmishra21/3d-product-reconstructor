import test from 'node:test'
import assert from 'node:assert/strict'
import { getModelOutput, saveModelOutput } from '../src/lib/reconstructions.js'
import { modelOutputPath } from '../src/lib/storage.js'

const owner = '11111111-1111-4111-8111-111111111111'
const otherOwner = '99999999-9999-4999-8999-999999999999'
const reconstructionId = '22222222-2222-4222-8222-222222222222'
const checkpoint = 'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500'

function prediction() {
  return {
    schema_version: 2, status: 'complete', model: 'Pixel3Mesh', model_version: checkpoint,
    output_type: 'point_cloud_and_visible_surface', latency_ms: 31.5,
    global_points: Array.from({ length: 2048 }, (_, index) => [index / 2048, 0, 0]),
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]],
  }
}

function fakeClient(activeUser = owner, savedRow = null, failInsert = false) {
  const calls = []
  const tables = { model_reconstruction_outputs: savedRow }
  const query = {
    insert(row) { calls.push(['insert', row]); this.row = row; return this },
    select(columns) { calls.push(['select', columns]); return this },
    eq(key, value) { calls.push(['eq', key, value]); this.filters ??= {}; this.filters[key] = value; return this },
    order() { return this }, range() { return Promise.resolve({ data: [], error: null }) },
    maybeSingle() {
      if (this.row) {
        if (failInsert) return Promise.resolve({ data: null, error: new Error('insert rejected') })
        tables.model_reconstruction_outputs = this.row
      }
      const row = tables.model_reconstruction_outputs
      const visible = row && row.id === this.filters?.id && row.user_id === activeUser && row.user_id === this.filters?.user_id
      return Promise.resolve({ data: visible ? row : this.row ?? null, error: null })
    },
  }
  const client = {
    from(table) { calls.push(['from', table]); return query },
    auth: { getUser: async () => ({ data: { user: { id: activeUser } }, error: null }) },
  }
  return { client, calls }
}

const imageFile = new Blob(['real image bytes'], { type: 'image/png' })
Object.defineProperties(imageFile, { name: { value: 'chair.png' }, size: { value: 16 } })

test('saves genuine variable geometry with private keys and reopens authorized artifacts', async () => {
  const { client, calls } = fakeClient()
  const uploaded = []
  const row = await saveModelOutput({ userId: owner, inputFile: imageFile, width: 224, height: 224,
    camera: { pose: [0, 1, 0, 1] }, prediction: prediction(), objectName: 'Chair' }, {
    client, idFactory: () => reconstructionId,
    storage: async (userId, id, files) => {
      uploaded.push({ userId, id, files })
      return { input: modelOutputPath(userId, id, 'input', files.input.type),
        points: modelOutputPath(userId, id, 'points'), mesh: modelOutputPath(userId, id, 'mesh') }
    },
  })
  assert.equal(row.vertices_count, 3)
  assert.equal(row.faces_count, 1)
  assert.equal(row.checkpoint_sha256, checkpoint)
  assert.equal(uploaded.length, 1)
  assert.deepEqual(Object.keys(uploaded[0].files), ['input', 'points', 'mesh'])
  assert.equal(calls.find(([method, table]) => method === 'from' && table === 'model_reconstruction_outputs')[1], 'model_reconstruction_outputs')

  const { client: reader } = fakeClient(owner, row)
  const downloaded = await getModelOutput(reconstructionId, { client: reader,
    download: async () => ({ input: new Blob(['source']),
      points: new Blob(['ply\nformat ascii 1.0\nelement vertex 2048\nproperty float x\nproperty float y\nproperty float z\nend_header\n' +
        Array.from({ length: 2048 }, (_, index) => `${index / 2048} 0 0`).join('\n') + '\n']),
      mesh: new Blob(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n']),
    }),
  })
  assert.equal(downloaded.record.id, reconstructionId)
  assert.equal(downloaded.prediction.global_points.length, 2048)
  assert.deepEqual(downloaded.prediction.faces, [[0, 1, 2]])
})

test('record lookup filters ownership and rejects another user’s row', async () => {
  const row = { id: reconstructionId, user_id: owner, input_path: `${owner}/${reconstructionId}/model-v1/input.png`,
    points_path: `${owner}/${reconstructionId}/model-v1/global_points.ply`,
    mesh_path: `${owner}/${reconstructionId}/model-v1/visible_surface.obj` }
  const { client, calls } = fakeClient(otherOwner, row)
  assert.equal(await getModelOutput(reconstructionId, { client }), null)
  assert.ok(calls.some(([method, key, value]) => method === 'eq' && key === 'user_id' && value === otherOwner))
})

test('cleans uploaded objects if the variable geometry row cannot be saved', async () => {
  const { client } = fakeClient(owner, null, true)
  const removed = []
  await assert.rejects(saveModelOutput({ inputFile: imageFile, width: 224, height: 224,
    camera: { pose: [0, 1, 0, 1] }, prediction: prediction() }, {
    client, idFactory: () => reconstructionId,
    storage: async () => ({ input: 'a', points: 'b', mesh: 'c' }),
    cleanup: async (_bucket, paths) => removed.push(...paths),
  }), /insert rejected/)
  assert.deepEqual(removed, ['a', 'b', 'c'])
})

test('refuses corrupt or incompatible geometry before storage upload', async () => {
  const { client } = fakeClient()
  let uploadCalled = false
  const malformed = prediction()
  malformed.faces = [[0, 1, 99]]
  await assert.rejects(saveModelOutput({ inputFile: imageFile, width: 224, height: 224,
    camera: { pose: [0, 1, 0, 1] }, prediction: malformed }, {
    client, storage: async () => { uploadCalled = true },
  }), /invalid geometry/)
  assert.equal(uploadCalled, false)
})
