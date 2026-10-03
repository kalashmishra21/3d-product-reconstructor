import { api } from './api.js'
import { getCurrentSession } from './auth.js'

export async function preflightImage(file, { signal, client = api, sessionProvider = getCurrentSession } = {}) {
  const session = await sessionProvider()
  if (!session?.access_token) {
    const error = new Error('Your session has ended. Sign in to run preflight.')
    error.code = 'AUTH_REQUIRED'
    throw error
  }
  const form = new FormData()
  form.append('image', file, file.name)
  const { data } = await client.post('/api/v1/reconstructions/preflight', form, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    signal,
    timeout: 30000,
  })
  if (data?.status !== 'ready' || !Number.isInteger(data.width) || !Number.isInteger(data.height)) {
    const error = new Error('The API returned an unexpected preflight response.')
    error.code = 'BAD_RESPONSE'
    throw error
  }
  return data
}

export function preflightErrorMessage(error) {
  if (error?.code === 'AUTH_REQUIRED' || error?.response?.status === 401) return 'Your session has ended. Sign in to run preflight.'
  if (error?.response?.status === 413) return 'Image exceeds the upload or dimension limit.'
  if (error?.response?.status === 415) return 'The image format does not match its contents. Choose a JPEG, PNG, or WebP image.'
  if (error?.response?.status === 422) return 'The API could not decode this image. Choose another image.'
  if (error?.response?.status === 503) return 'Authentication is temporarily unavailable. Try again shortly.'
  if (error?.code === 'BAD_RESPONSE') return 'The API returned an unexpected response. Try again.'
  return 'The preflight request could not reach the API. Check the connection and retry.'
}
