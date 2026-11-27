import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteTriposrOutput, parseTriposrObj, saveTriposrOutput, uploadTriposrArtifacts } from '../src/lib/triposrHistory.js'

const owner = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const prediction = {
  schema_version: 3, status: 'complete', model: 'TripoSR', engine: 'stabilityai/TripoSR',
  model_version: '429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee',
  output_type: 'colored_triangle_mesh', vertices_count: 3, faces_count: 1,
  latency_ms: 100, model_init_ms: 9000, resolution: 256,
  vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]],
  vertex_colors: [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]],
}
const file = new Blob(['source'], { type: 'image/jpeg' })
Object.defineProperties(file, { name: { value: 'speaker.jpg' }, size: { value: 6 } })

function clientWithInsert() {
  let inserted
  const query = {
    insert(row) { inserted = row; return this }, select() { return this },
    maybeSingle: async () => ({ data: { ...inserted }, error: null }),
    delete() { return this }, eq() { return this },
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: (table) => { assert.equal(table, 'triposr_reconstruction_outputs'); return query },
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), remove: async () => ({ data: [], error: null }) }) },
  }
}

test('private TripoSR path layout is owner-scoped and includes variable mesh exports', async () => {
  const uploaded = []
  const client = { storage: { from: (bucket) => {
    assert.equal(bucket, 'reconstruction-artifacts')
    return { upload: async (path, body, options) => { uploaded.push({ path, body, options }); return { data: {}, error: null } } }
  } } }
  const paths = await uploadTriposrArtifacts(owner, id, {
    input: file, obj: new Blob(['obj']), glb: new Blob(['glb']),
  }, { client })
  assert.deepEqual(paths, {
    input: `${owner}/${id}/triposr-v1/input.jpg`,
    obj: `${owner}/${id}/triposr-v1/prediction.obj`,
    glb: `${owner}/${id}/triposr-v1/prediction.glb`,
  })
  assert.equal(uploaded.length, 3)
})

test('saves versioned geometry counts and checkpoint identity without camera data', async () => {
  const row = await saveTriposrOutput({ userId: owner, file, width: 960, height: 720, prediction }, {
    client: clientWithInsert(), idFactory: () => id,
    exporter: async (_prediction, format) => ({ blob: new Blob([format]), sizeBytes: format.length }),
    upload: async (userId, recordId) => ({ input: `${userId}/${recordId}/triposr-v1/input.jpg`,
      obj: `${userId}/${recordId}/triposr-v1/prediction.obj`, glb: `${userId}/${recordId}/triposr-v1/prediction.glb` }),
  })
  assert.equal(row.engine, 'stabilityai/TripoSR')
  assert.equal(row.vertices_count, 3)
  assert.equal(row.faces_count, 1)
  assert.equal(row.model_version, prediction.model_version)
  assert.equal(Object.hasOwn(row, 'camera_json'), false)
})

test('deletes only the authenticated owner row and its private artifacts', async () => {
  const removed = []
  const row = { id, user_id: owner, input_path: 'in', obj_path: 'obj', glb_path: 'glb' }
  const query = {
    select() { return this }, eq() { return this }, delete() { return this },
    maybeSingle: async () => ({ data: row, error: null }),
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve) },
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: () => query, storage: { from: () => ({ remove: async (paths) => { removed.push(...paths); return { data: [], error: null } } }) } }
  assert.equal(await deleteTriposrOutput(id, { client }), true)
  assert.deepEqual(removed, ['in', 'obj', 'glb'])
  assert.equal(await deleteTriposrOutput('invalid', { client }), false)
})

test('reopened OBJ parsing preserves variable counts and assigns neutral color when OBJ has none', () => {
  const mesh = parseTriposrObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', { vertices_count: 3, faces_count: 1 })
  assert.deepEqual(mesh.faces, [[0, 1, 2]])
  assert.equal(mesh.vertex_colors.length, 3)
  assert.deepEqual(mesh.vertex_colors[0], [185, 190, 180, 255])
  assert.throws(() => parseTriposrObj('v 0 0 0\nf 1 2 3', { vertices_count: 1, faces_count: 1 }), /invalid face indices/)
})
