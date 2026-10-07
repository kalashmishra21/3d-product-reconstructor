import { supabase } from './auth.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const RECONSTRUCTION_COLUMNS = 'id,user_id,object_name,source_filename,source_mime,source_width,source_height,source_size_bytes,status,model_name,stage,vertices_count,faces_count,inference_ms,model_init_ms,total_ms,source_path,mesh_json_path,obj_path,glb_path,obj_size_bytes,glb_size_bytes,error_message,created_at,updated_at,completed_at'
export const PROFILE_RECENT_COLUMNS = 'id,object_name,source_filename,status,created_at'
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
