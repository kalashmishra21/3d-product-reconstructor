import { supabase } from './auth.js'
import { exportTriposrMesh } from '../reconstruction/triposrExport.js'
import { validateTriposrPrediction } from './triposr.js'

const TABLE = 'triposr_reconstruction_outputs'
const BUCKET = 'reconstruction-artifacts'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COLUMNS = 'id,user_id,object_name,source_filename,source_mime,source_width,source_height,source_size_bytes,model_name,engine,model_version,output_type,extraction_resolution,vertices_count,faces_count,inference_ms,model_init_ms,input_path,obj_path,glb_path,input_size_bytes,obj_size_bytes,glb_size_bytes,created_at'

function apiOrThrow(client) {
  if (!client) throw new Error('Supabase is not configured')
  return client
}

function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

function extensionFor(mime) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime]
}

function artifactPaths(userId, id, mime) {
  if (!UUID.test(userId) || !UUID.test(id) || !extensionFor(mime)) throw new Error('Invalid private reconstruction identity')
  const root = `${userId.toLowerCase()}/${id.toLowerCase()}/triposr-v1`
  return { input: `${root}/input.${extensionFor(mime)}`, obj: `${root}/prediction.obj`, glb: `${root}/prediction.glb` }
}

export function parseTriposrObj(text, record) {
  const vertices = []
  const vertexColors = []
  const faces = []
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') {
      const point = parts.slice(1, 4).map(Number)
      if (point.length !== 3 || !point.every(Number.isFinite)) throw new Error('Saved TripoSR OBJ contains invalid vertices')
      vertices.push(point)
      const rgb = parts.slice(4, 7).map(Number)
      vertexColors.push(rgb.length === 3 && rgb.every(Number.isFinite)
        ? [...rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * 255)))), 255]
        : [185, 190, 180, 255])
    } else if (parts[0] === 'f') {
      const polygon = parts.slice(1).map((token) => {
        const raw = Number(token.split('/')[0])
        return raw < 0 ? vertices.length + raw : raw - 1
      })
      if (polygon.length < 3 || polygon.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)) {
        throw new Error('Saved TripoSR OBJ contains invalid face indices')
      }
      for (let index = 1; index < polygon.length - 1; index += 1) faces.push([polygon[0], polygon[index], polygon[index + 1]])
    }
  }
  if (vertices.length !== record.vertices_count || faces.length !== record.faces_count || !vertices.length || !faces.length) {
    throw new Error('Saved TripoSR geometry count does not match its history record')
  }
  return { vertices, faces, vertex_colors: vertexColors }
}

export async function uploadTriposrArtifacts(userId, id, files, { client = supabase } = {}) {
  const api = apiOrThrow(client)
  const paths = artifactPaths(userId, id, files.input.type)
  const objects = [
    ['input', files.input, files.input.type],
    ['obj', files.obj, 'text/plain'],
    ['glb', files.glb, 'model/gltf-binary'],
  ]
  const uploaded = []
  try {
    for (const [kind, body, contentType] of objects) {
      const result = await api.storage.from(BUCKET).upload(paths[kind], body, { contentType, upsert: false })
      unwrap(result)
      uploaded.push(paths[kind])
    }
    return paths
  } catch (error) {
    if (uploaded.length) await api.storage.from(BUCKET).remove(uploaded).catch(() => {})
    throw error
  }
}

export async function downloadTriposrArtifacts(paths, { client = supabase } = {}) {
  const api = apiOrThrow(client)
  const files = {}
  for (const kind of ['input', 'obj', 'glb']) {
    const path = paths?.[`${kind}_path`]
    if (typeof path !== 'string' || path.split('/').length !== 4 || path.split('/')[2] !== 'triposr-v1') {
      throw new Error('Saved TripoSR artifact path is invalid')
    }
    files[kind] = unwrap(await api.storage.from(BUCKET).download(path))
  }
  return files
}

export async function saveTriposrOutput(input, {
  client = supabase,
  exporter = exportTriposrMesh,
  upload = uploadTriposrArtifacts,
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const api = apiOrThrow(client)
  const auth = await api.auth.getUser()
  const userId = auth.data?.user?.id
  if (auth.error || !UUID.test(String(userId ?? '')) || (input.userId && input.userId !== userId)) throw new Error('Sign in to save this reconstruction')
  if (!input.file || !extensionFor(input.file.type) || input.file.size < 1 || input.file.size > 10 * 1024 * 1024 ||
      !Number.isInteger(input.width) || input.width < 1 || !Number.isInteger(input.height) || input.height < 1 ||
      !validateTriposrPrediction(input.prediction)) throw new Error('A validated image and TripoSR prediction are required')
  const id = idFactory()
  if (!UUID.test(id)) throw new Error('Could not create a reconstruction identity')
  const [obj, glb] = await Promise.all([
    exporter(input.prediction, 'obj'), exporter(input.prediction, 'glb'),
  ])
  const paths = await upload(userId, id, { input: input.file, obj: obj.blob, glb: glb.blob }, { client: api })
  const prediction = input.prediction
  const row = {
    id, user_id: userId,
    object_name: String(input.objectName ?? '').trim().slice(0, 80) || null,
    source_filename: String(input.file.name ?? 'input').split(/[\\/]/).pop().slice(0, 255),
    source_mime: input.file.type, source_width: input.width, source_height: input.height,
    source_size_bytes: input.file.size, model_name: 'TripoSR', engine: prediction.engine,
    model_version: prediction.model_version, output_type: prediction.output_type,
    extraction_resolution: prediction.resolution, vertices_count: prediction.vertices_count,
    faces_count: prediction.faces_count, inference_ms: prediction.latency_ms,
    model_init_ms: prediction.model_init_ms ?? 0,
    input_path: paths.input, obj_path: paths.obj, glb_path: paths.glb,
    input_size_bytes: input.file.size, obj_size_bytes: obj.sizeBytes ?? obj.blob.size,
    glb_size_bytes: glb.sizeBytes ?? glb.blob.size,
  }
  try {
    const saved = unwrap(await api.from(TABLE).insert(row).select(COLUMNS).maybeSingle())
    if (!saved) throw new Error('Supabase did not return the saved TripoSR result')
    return saved
  } catch (error) {
    await api.storage.from(BUCKET).remove(Object.values(paths)).catch(() => {})
    throw error
  }
}

export async function listTriposrOutputs({ client = supabase, limit = 24 } = {}) {
  const api = apiOrThrow(client)
  const auth = await api.auth.getUser()
  const userId = auth.data?.user?.id
  if (auth.error || !UUID.test(String(userId ?? ''))) throw new Error('Sign in to open your history')
  const count = Math.max(1, Math.min(50, Math.trunc(limit)))
  return unwrap(await api.from(TABLE).select(COLUMNS).eq('user_id', userId)
    .order('created_at', { ascending: false }).range(0, count - 1)) ?? []
}

export async function getTriposrOutput(id, { client = supabase, download = downloadTriposrArtifacts } = {}) {
  if (!UUID.test(String(id ?? ''))) return null
  const api = apiOrThrow(client)
  const auth = await api.auth.getUser()
  const userId = auth.data?.user?.id
  if (auth.error || !UUID.test(String(userId ?? ''))) throw new Error('Sign in to open your history')
  const row = unwrap(await api.from(TABLE).select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle())
  if (!row) return null
  const files = await download(row)
  return { row, ...files }
}

export async function deleteTriposrOutput(id, { client = supabase } = {}) {
  if (!UUID.test(String(id ?? ''))) return false
  const api = apiOrThrow(client)
  const auth = await api.auth.getUser()
  const userId = auth.data?.user?.id
  if (auth.error || !UUID.test(String(userId ?? ''))) throw new Error('Sign in to remove this reconstruction')
  const row = unwrap(await api.from(TABLE).select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle())
  if (!row) return false
  unwrap(await api.from(TABLE).delete().eq('id', id).eq('user_id', userId))
  await api.storage.from(BUCKET).remove([row.input_path, row.obj_path, row.glb_path])
  return true
}
