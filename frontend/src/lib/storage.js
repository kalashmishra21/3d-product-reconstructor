import { supabase } from './auth.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const BUCKETS = new Set(['avatars', 'reconstruction-artifacts'])
function id(value) {
  if (!UUID.test(String(value ?? ''))) throw new Error('Invalid storage identity')
  return value.toLowerCase()
}
function clientOrThrow(client) {
  if (!client) throw new Error('Supabase is not configured')
  return client
}
function bucketOrThrow(bucket) {
  if (!BUCKETS.has(bucket)) throw new Error('Unsupported private bucket')
  return bucket
}
function pathOrThrow(path, bucket) {
  const parts = String(path ?? '').split('/')
  const validOwner = UUID.test(parts[0] ?? '')
  const avatar = parts.length === 2 && /^([0-9a-f-]{36})\.(jpg|png|webp)$/i.exec(parts[1])
  const artifact = parts.length === 3 && UUID.test(parts[1]) && /^(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$/i.test(parts[2])
  const modelOutput = parts.length === 4 && UUID.test(parts[1]) && parts[2] === 'model-v1' &&
    /^(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$/i.test(parts[3])
  if (!validOwner || bucket === 'avatars' && (!avatar || !UUID.test(avatar[1])) ||
      bucket === 'reconstruction-artifacts' && !artifact && !modelOutput) throw new Error('Invalid private object path')
  return path
}
function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

export function avatarPath(userId, avatarId, mime) {
  const extension = EXTENSION[mime]
  if (!extension) throw new Error('Unsupported avatar MIME')
  return `${id(userId)}/${id(avatarId)}.${extension}`
}

export function artifactPath(userId, reconstructionId, kind, sourceMime) {
  const root = `${id(userId)}/${id(reconstructionId)}`
  if (kind === 'source') {
    const extension = EXTENSION[sourceMime]
    if (!extension) throw new Error('Unsupported source MIME')
    return `${root}/source.${extension}`
  }
  if (!['json', 'obj', 'glb'].includes(kind)) throw new Error('Unsupported artifact')
  return `${root}/stage3.${kind}`
}

export async function uploadSource(userId, reconstructionId, file, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  const path = artifactPath(userId, reconstructionId, 'source', file.type)
  unwrap(await api.storage.from('reconstruction-artifacts').upload(path, file, { contentType: file.type, upsert: false }))
  return path
}

export async function uploadArtifactSet(userId, reconstructionId, set, { client = supabase, upsert = false } = {}) {
  const api = clientOrThrow(client)
  const paths = {}
  for (const [kind, mime] of [['json', 'application/json'], ['obj', 'text/plain'], ['glb', 'model/gltf-binary']]) {
    const path = artifactPath(userId, reconstructionId, kind)
    unwrap(await api.storage.from('reconstruction-artifacts').upload(path, set[kind].blob, { contentType: mime, upsert }))
    paths[kind] = path
  }
  return paths
}

export async function uploadAvatar(userId, avatarId, file, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  const path = avatarPath(userId, avatarId, file.type)
  unwrap(await api.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false }))
  return path
}

export async function signedImageUrl(bucket, path, ttlSeconds = 120, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  const data = unwrap(await api.storage.from(bucketOrThrow(bucket)).createSignedUrl(pathOrThrow(path, bucket), ttlSeconds))
  return data.signedUrl
}

export async function downloadPrivate(bucket, path, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  return unwrap(await api.storage.from(bucketOrThrow(bucket)).download(pathOrThrow(path, bucket)))
}

export async function removeObjects(bucket, paths, { client = supabase } = {}) {
  if (!Array.isArray(paths) || paths.length === 0) return []
  const api = clientOrThrow(client)
  return unwrap(await api.storage.from(bucketOrThrow(bucket)).remove(paths.map((path) => pathOrThrow(path, bucket))))
}

/** Build owner-scoped keys for variable-size Pixel3Mesh outputs. */
export function modelOutputPath(userId, reconstructionId, kind, sourceMime) {
  const root = `${id(userId)}/${id(reconstructionId)}/model-v1`
  if (kind === 'input') {
    const extension = EXTENSION[sourceMime]
    if (!extension) throw new Error('Unsupported source MIME')
    return `${root}/input.${extension}`
  }
  if (kind === 'points') return `${root}/global_points.ply`
  if (kind === 'mesh') return `${root}/visible_surface.obj`
  throw new Error('Unsupported model output')
}

/** Upload the three genuine request artifacts to the existing private bucket. */
export async function uploadModelOutputSet(userId, reconstructionId, files, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  const objects = [
    ['input', files.input, files.input.type],
    ['points', files.points, 'application/octet-stream'],
    ['mesh', files.mesh, 'text/plain'],
  ]
  const paths = {}
  try {
    for (const [kind, body, contentType] of objects) {
      const path = modelOutputPath(userId, reconstructionId, kind, files.input.type)
      unwrap(await api.storage.from('reconstruction-artifacts').upload(path, body, {
        contentType, upsert: false,
      }))
      paths[kind] = path
    }
    return paths
  } catch (error) {
    if (Object.keys(paths).length) {
      await api.storage.from('reconstruction-artifacts').remove(Object.values(paths)).catch(() => {})
    }
    throw error
  }
}

/** Download authorized private artifacts; Supabase RLS checks the current user. */
export async function downloadModelOutputSet(paths, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  const result = {}
  for (const kind of ['input', 'points', 'mesh']) {
    const path = paths?.[kind]
    if (!path) throw new Error('Saved reconstruction is missing an artifact path')
    pathOrThrow(path, 'reconstruction-artifacts')
    const signed = unwrap(await api.storage.from('reconstruction-artifacts').createSignedUrl(path, 120))
    const response = await fetch(signed.signedUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error('Private reconstruction download failed')
    result[kind] = await response.blob()
  }
  return result
}
