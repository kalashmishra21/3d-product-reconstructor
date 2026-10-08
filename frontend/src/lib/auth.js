import { createClient } from '@supabase/supabase-js'
import { safeWorkspaceNext } from '../auth/safeWorkspaceNext.js'

const env = import.meta.env ?? {}
const url = env.VITE_SUPABASE_URL?.trim()
const key = env.VITE_SUPABASE_ANON_KEY?.trim()

function validUrl(value) {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

export const authConfigured = Boolean(validUrl(url) && key)
export const supabase = authConfigured
  ? createClient(url, key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    })
  : null

function requireAuthClient() {
  if (!supabase) throw new Error('Authentication is not configured. Add the Supabase URL and public key to frontend/.env.local.')
  return supabase.auth
}

function unwrap(result) {
  if (result.error) throw result.error
  return result.data
}

export async function getCurrentUser() {
  return unwrap(await requireAuthClient().getUser()).user
}

export async function getCurrentSession() {
  return unwrap(await requireAuthClient().getSession()).session
}

export async function signInWithEmail(email, password) {
  return unwrap(await requireAuthClient().signInWithPassword({ email, password }))
}

export async function signUpWithEmail({ name, email, password }) {
  return unwrap(await requireAuthClient().signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  }))
}

export async function signInWithGoogle(next = '/dashboard') {
  const redirect = new URL('/auth/callback', window.location.origin)
  redirect.searchParams.set('next', safeWorkspaceNext(next))
  return unwrap(await requireAuthClient().signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirect.toString() },
  }))
}

export async function sendPasswordReset(email) {
  const redirect = new URL('/auth/callback', window.location.origin)
  redirect.searchParams.set('next', '/reset-password')
  return unwrap(await requireAuthClient().resetPasswordForEmail(email, { redirectTo: redirect.toString() }))
}

export async function updatePassword(password) {
  return unwrap(await requireAuthClient().updateUser({ password }))
}

export async function exchangeAuthCode(code, flowId) {
  return unwrap(await requireAuthClient().exchangeCodeForSession(code, flowId ? { flowId } : undefined))
}

export async function signOut() {
  return unwrap(await requireAuthClient().signOut())
}
