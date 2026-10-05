import { supabase } from './auth.js'

function clientOrThrow(client) {
  if (!client) throw new Error('Supabase is not configured')
  return client
}
async function requireOwnUser(client, id) {
  const { data, error } = await client.auth.getUser()
  if (error || data?.user?.id !== id) throw new Error('Sign in to continue')
}
function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

export async function loadProfile(userId, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  await requireOwnUser(api, userId)
  return unwrap(await api.from('profiles').select('id,display_name,avatar_path,created_at,updated_at').eq('id', userId).maybeSingle())
}

export async function saveProfile(userId, patch, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  await requireOwnUser(api, userId)
  const allowed = {}
  if (Object.hasOwn(patch, 'display_name')) {
    const value = String(patch.display_name ?? '').trim()
    if (value.length > 80) throw new Error('Display name is too long')
    allowed.display_name = value || null
  }
  if (Object.hasOwn(patch, 'avatar_path')) allowed.avatar_path = patch.avatar_path
  if (!Object.keys(allowed).length) throw new Error('No supported profile fields')
  return unwrap(await api.from('profiles').update(allowed).eq('id', userId).select('id,display_name,avatar_path,created_at,updated_at').maybeSingle())
}

export async function ensureProfile(userId, displayName, { client = supabase } = {}) {
  const api = clientOrThrow(client)
  await requireOwnUser(api, userId)
  const current = await loadProfile(userId, { client: api })
  if (current) return current
  return unwrap(await api.from('profiles').insert({ id: userId, display_name: String(displayName ?? '').trim().slice(0, 80) || null }).select('id,display_name,avatar_path,created_at,updated_at').maybeSingle())
}
