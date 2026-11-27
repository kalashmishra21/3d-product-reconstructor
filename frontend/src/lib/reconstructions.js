import { supabase } from './auth.js'
import { downloadModelOutputSet, removeObjects, uploadModelOutputSet } from './storage.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const RECONSTRUCTION_COLUMNS = 'id,user_id,object_name,source_filename,source_mime,source_width,source_height,source_size_bytes,status,model_name,stage,vertices_count,faces_count,inference_ms,model_init_ms,total_ms,source_path,mesh_json_path,obj_path,glb_path,obj_size_bytes,glb_size_bytes,error_message,created_at,updated_at,completed_at'
export const PROFILE_RECENT_COLUMNS = 'id,object_name,source_filename,status,created_at'
export const MODEL_OUTPUT_COLUMNS = 'id,user_id,object_name,source_filename,source_mime,source_width,source_height,source_size_bytes,camera_json,model_name,model_version,checkpoint_sha256,engine,output_type,global_points_count,vertices_count,faces_count,inference_ms,input_path,points_path,mesh_path,input_size_bytes,points_size_bytes,mesh_size_bytes,created_at'
const MUTABLE = new Set(['object_name', 'status', 'model_name', 'stage', 'vertices_count', 'faces_count', 'inference_ms', 'model_init_ms', 'total_ms', 'source_path', 'mesh_json_path', 'obj_path', 'glb_path', 'obj_size_bytes', 'glb_size_bytes', 'error_message'])

function useClient(client) {
  if (!client) throw new Error('Supabase is not configured')
  return client
}
function validId(value) { return UUID.test(String(value ?? '')) }
function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}
async function ownUser(client, userId) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id || (userId && data.user.id !== userId)) throw new Error('Sign in to continue')
  return data.user.id
}

export async function createReconstruction(input, { client = supabase } = {}) {
  const api = useClient(client)
  const userId = await ownUser(api, input.userId)
  if (!validId(userId) || !['image/png', 'image/jpeg', 'image/webp'].includes(input.mime) ||
      !Number.isInteger(input.width) || input.width < 1 || !Number.isInteger(input.height) || input.height < 1 ||
      !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 10 * 1024 * 1024) {
    throw new Error('Validated image metadata is required')
  }
  const filename = String(input.filename ?? '').split(/[\\/]/).pop().slice(0, 255)
  if (!filename) throw new Error('Source filename is required')
  const row = {
    user_id: userId, object_name: String(input.objectName ?? '').trim().slice(0, 80) || null,
    source_filename: filename, source_mime: input.mime, source_width: input.width,
    source_height: input.height, source_size_bytes: input.sizeBytes, status: 'processing',
  }
  return unwrap(await api.from('reconstructions').insert(row).select(RECONSTRUCTION_COLUMNS).maybeSingle())
}

export async function patchReconstruction(id, patch, { expectedStatus, client = supabase } = {}) {
  if (!validId(id)) throw new Error('Invalid reconstruction ID')
  const api = useClient(client)
  const userId = await ownUser(api)
  const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => MUTABLE.has(key)))
  if (!Object.keys(allowed).length) throw new Error('No supported reconstruction fields')
  let query = api.from('reconstructions').update(allowed).eq('id', id).eq('user_id', userId)
  if (expectedStatus) query = query.eq('status', expectedStatus)
  const row = unwrap(await query.select(RECONSTRUCTION_COLUMNS).maybeSingle())
  if (!row && expectedStatus) throw Object.assign(new Error('Reconstruction changed while saving'), { code: 'CONFLICT' })
  return row
}

export async function getReconstruction(id, { client = supabase } = {}) {
  if (!validId(id)) return null
  const api = useClient(client)
  const userId = await ownUser(api)
  return unwrap(await api.from('reconstructions').select(RECONSTRUCTION_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle())
}

export async function listReconstructions({ userId, status, search = '', offset = 0, limit = 24 } = {}, { client = supabase } = {}) {
  const api = useClient(client)
  const owner = await ownUser(api, userId)
  let query = api.from('reconstructions').select(RECONSTRUCTION_COLUMNS).eq('user_id', owner)
  if (status && status !== 'all') {
    query = status === 'failed' ? query.in('status', ['failed', 'interrupted']) : query.eq('status', status)
  }
  const safeSearch = String(search).normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (safeSearch) query = query.or(`object_name.ilike.%${safeSearch}%,source_filename.ilike.%${safeSearch}%`)
  const start = Math.max(0, Math.trunc(offset))
  const count = Math.min(50, Math.max(1, Math.trunc(limit)))
  return unwrap(await query.order('created_at', { ascending: false }).range(start, start + count - 1)) ?? []
}

export async function listRecentReconstructions(userId, limit = 3, options = {}) {
  const api = useClient(options.client ?? supabase)
  const owner = await ownUser(api, userId)
  const count = Math.min(10, Math.max(1, Math.trunc(limit)))
  return unwrap(await api.from('reconstructions').select(PROFILE_RECENT_COLUMNS).eq('user_id', owner)
    .order('created_at', { ascending: false }).range(0, count - 1)) ?? []
}

export async function getProfileStats(userId, options = {}) {
  return {
    total: await countReconstructions(userId, null, options),
    completed: await countReconstructions(userId, 'completed', options),
    lowVolume: await countReconstructions(userId, 'low_volume', options),
    failed: await countReconstructions(userId, 'failed', options),
  }
}

export async function countReconstructions(userId, status, { client = supabase } = {}) {
  const api = useClient(client)
  const owner = await ownUser(api, userId)
  let query = api.from('reconstructions').select('id', { count: 'exact', head: true }).eq('user_id', owner)
  if (status) query = query.eq('status', status)
  const result = await query
  if (result.error) throw result.error
  return result.count ?? 0
}

export async function renameReconstruction(id, name, options) {
  return patchReconstruction(id, { object_name: String(name ?? '').trim().slice(0, 80) || null }, options)
}

function checkedModelOutput(input) {
  const prediction = input?.prediction
  const file = input?.inputFile
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error('A validated source image is required')
  }
  if (file.size && (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width !== 224 || input.height !== 224)) {
    throw new Error('The calibrated model requires a 224 × 224 source image')
  }
  if (!input.camera || typeof input.camera !== 'object' || Array.isArray(input.camera)) {
    throw new Error('The matching calibrated camera is required to reopen this reconstruction')
  }
  if (prediction?.schema_version !== 2 || prediction.status !== 'complete' ||
      prediction.model !== 'Pixel3Mesh' || prediction.output_type !== 'point_cloud_and_visible_surface' ||
      !/^[a-f0-9]{64}$/i.test(prediction.model_version ?? '') ||
      typeof prediction.latency_ms !== 'number' || !Number.isFinite(prediction.latency_ms) || prediction.latency_ms < 0 ||
      !Array.isArray(prediction.global_points) || prediction.global_points.length !== 2048 ||
      !Array.isArray(prediction.vertices) || prediction.vertices.length < 3 ||
      !Array.isArray(prediction.faces) || prediction.faces.length < 1) {
    throw new Error('A valid Pixel3Mesh prediction is required')
  }
  const finitePoints = (points) => points.every((point) => Array.isArray(point) && point.length === 3 &&
    point.every((value) => typeof value === 'number' && Number.isFinite(value)))
  if (!finitePoints(prediction.global_points) || !finitePoints(prediction.vertices) ||
      prediction.faces.some((face) => !Array.isArray(face) || face.length !== 3 ||
        face.some((index) => !Number.isInteger(index) || index < 0 || index >= prediction.vertices.length))) {
    throw new Error('Prediction contains invalid geometry')
  }
  return prediction
}

function parseAsciiPly(blobText, expectedPoints) {
  const headerEnd = blobText.indexOf('end_header\n')
  if (headerEnd < 0 || !/^format ascii 1\.0$/m.test(blobText.slice(0, headerEnd))) {
    throw new Error('Saved point cloud is not a supported ASCII PLY file')
  }
  const count = Number(blobText.match(/^element vertex (\d+)$/m)?.[1])
  if (count !== expectedPoints) throw new Error('Saved point cloud count does not match its history record')
  const rows = blobText.slice(headerEnd + 'end_header\n'.length).trim().split(/\r?\n/)
  if (rows.length !== count) throw new Error('Saved point cloud is incomplete')
  const points = rows.map((row) => row.trim().split(/\s+/).slice(0, 3).map(Number))
  if (points.some((point) => point.length !== 3 || point.some((value) => !Number.isFinite(value)))) {
    throw new Error('Saved point cloud contains invalid coordinates')
  }
  return points
}

function parsePredictedObj(text, expectedVertices, expectedFaces) {
  const vertices = []
  const faces = []
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') {
      const vertex = parts.slice(1, 4).map(Number)
      if (vertex.length !== 3 || vertex.some((value) => !Number.isFinite(value))) throw new Error('Saved OBJ has invalid vertices')
      vertices.push(vertex)
    } else if (parts[0] === 'f') {
      const polygon = parts.slice(1).map((part) => Number(part.split('/')[0]) - 1)
      if (polygon.length < 3 || polygon.some((index) => !Number.isInteger(index) || index < 0)) throw new Error('Saved OBJ has invalid faces')
      for (let index = 1; index < polygon.length - 1; index += 1) faces.push([polygon[0], polygon[index], polygon[index + 1]])
    }
  }
  if (vertices.length !== expectedVertices || faces.length !== expectedFaces ||
      faces.some((face) => face.some((index) => index >= vertices.length))) {
    throw new Error('Saved OBJ geometry does not match its history record')
  }
  return { vertices, faces }
}

function asciiPointCloud(points) {
  return ['ply', 'format ascii 1.0', `element vertex ${points.length}`, 'property float x',
    'property float y', 'property float z', 'end_header', ...points.map((point) => point.join(' ')), ''].join('\n')
}

function predictedObj(prediction) {
  return [...prediction.vertices.map((vertex) => `v ${vertex.join(' ')}`),
    ...prediction.faces.map((face) => `f ${face.map((index) => index + 1).join(' ')}`), ''].join('\n')
}

/** Save a genuine model response and source under private owner-scoped keys. */
export async function saveModelOutput(input, { client = supabase, storage = uploadModelOutputSet,
  cleanup = removeObjects, idFactory = () => crypto.randomUUID() } = {}) {
  const api = useClient(client)
  const userId = await ownUser(api, input?.userId)
  const prediction = checkedModelOutput(input)
  const reconstructionId = idFactory()
  if (!validId(reconstructionId)) throw new Error('Could not create reconstruction identity')
  const pointBlob = new Blob([asciiPointCloud(prediction.global_points)], { type: 'application/octet-stream' })
  const meshBlob = new Blob([predictedObj(prediction)], { type: 'text/plain' })
  const files = { input: input.inputFile, points: pointBlob, mesh: meshBlob }
  const paths = await storage(userId, reconstructionId, files, { client: api })
  const row = {
    id: reconstructionId, user_id: userId,
    object_name: String(input.objectName ?? '').trim().slice(0, 80) || null,
    source_filename: String(input.inputFile.name ?? 'input').split(/[\\/]/).pop().slice(0, 255),
    source_mime: input.inputFile.type, source_width: input.width, source_height: input.height,
    source_size_bytes: input.inputFile.size, camera_json: input.camera, model_name: prediction.model,
    model_version: prediction.model_version, checkpoint_sha256: prediction.model_version.toLowerCase(),
    engine: 'pixel3mesh-six-category', output_type: prediction.output_type,
    global_points_count: prediction.global_points.length, vertices_count: prediction.vertices.length,
    faces_count: prediction.faces.length, inference_ms: prediction.latency_ms,
    input_path: paths.input, points_path: paths.points, mesh_path: paths.mesh,
    input_size_bytes: input.inputFile.size, points_size_bytes: pointBlob.size, mesh_size_bytes: meshBlob.size,
  }
  try {
    const saved = unwrap(await api.from('model_reconstruction_outputs').insert(row).select(MODEL_OUTPUT_COLUMNS).maybeSingle())
    if (!saved) throw new Error('Supabase did not return the saved reconstruction')
    return saved
  } catch (error) {
    await cleanup('reconstruction-artifacts', Object.values(paths), { client: api }).catch(() => {})
    throw error
  }
}

export async function getModelOutput(id, { client = supabase, download = downloadModelOutputSet } = {}) {
  if (!validId(id)) return null
  const api = useClient(client)
  const userId = await ownUser(api)
  const row = unwrap(await api.from('model_reconstruction_outputs').select(MODEL_OUTPUT_COLUMNS)
    .eq('id', id).eq('user_id', userId).maybeSingle())
  if (!row) return null
  const artifacts = await download({ input: row.input_path, points: row.points_path, mesh: row.mesh_path }, { client: api })
  const pointsText = await artifacts.points.text()
  const meshText = await artifacts.mesh.text()
  const globalPoints = parseAsciiPly(pointsText, row.global_points_count)
  const geometry = parsePredictedObj(meshText, row.vertices_count, row.faces_count)
  return {
    record: row,
    input: artifacts.input,
    camera: row.camera_json,
    prediction: {
      schema_version: 2, status: 'complete', model: row.model_name, model_version: row.model_version,
      output_type: row.output_type, latency_ms: Number(row.inference_ms), global_points: globalPoints,
      vertices: geometry.vertices, faces: geometry.faces,
      vertices_count: geometry.vertices.length, faces_count: geometry.faces.length,
    },
  }
}

export async function listModelOutputs({ client = supabase, limit = 12 } = {}) {
  const api = useClient(client)
  const userId = await ownUser(api)
  const count = Math.min(50, Math.max(1, Math.trunc(limit)))
  return unwrap(await api.from('model_reconstruction_outputs').select(MODEL_OUTPUT_COLUMNS)
    .eq('user_id', userId).order('created_at', { ascending: false }).range(0, count - 1)) ?? []
}

/** A no-op status update refreshes the database-managed updated_at timestamp. */
export async function heartbeatReconstruction(id, { client = supabase } = {}) {
  return patchReconstruction(id, { status: 'processing' }, { expectedStatus: 'processing', client })
}

/** Compare-and-set: a completed or recently refreshed row cannot become interrupted. */
export async function interruptStaleReconstruction(id, cutoffIso, { client = supabase } = {}) {
  if (!validId(id) || !Number.isFinite(Date.parse(cutoffIso))) throw new Error('Invalid stale reconstruction')
  const api = useClient(client)
  const userId = await ownUser(api)
  return unwrap(await api.from('reconstructions').update({ status: 'interrupted' })
    .eq('id', id).eq('user_id', userId).eq('status', 'processing').lt('updated_at', cutoffIso)
    .select(RECONSTRUCTION_COLUMNS).maybeSingle())
}
