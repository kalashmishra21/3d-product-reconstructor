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
function pathOrThrow(path) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}(?:\/|\.)/.test(String(path)) || String(path).includes('..')) throw new Error('Invalid private object path')
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
  const data = unwrap(await api.storage.from(bucketOrThrow(bucket)).createSignedUrl(pathOrThrow(path), ttlSeconds))
  return data.signedUrl
}

export async function downloadPrivate(bucket, path, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  return unwrap(await api.storage.from(bucketOrThrow(bucket)).download(pathOrThrow(path)))
}

export async function removeObjects(bucket, paths, { client = supabase } = {}) {
  if (!Array.isArray(paths) || paths.length === 0) return []
  const api = clientOrThrow(client)
  return unwrap(await api.storage.from(bucketOrThrow(bucket)).remove(paths.map(pathOrThrow)))
}
