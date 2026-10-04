import { api } from './api.js'
import { getCurrentSession } from './auth.js'
import { validateMeshResponse } from '../reconstruction/mesh.js'

export async function inferImage(file, { signal, client = api, sessionProvider = getCurrentSession } = {}) {
  const session = await sessionProvider()
  if (!session?.access_token) {
    const error = new Error('Your session has ended. Sign in to reconstruct a mesh.')
    error.code = 'AUTH_REQUIRED'
    throw error
  }
  const form = new FormData()
  form.append('image', file, file.name)
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { data } = await client.post('/api/v1/reconstructions/infer', form, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    signal,
    timeout: 180000,
  })
  if (validateMeshResponse(data)) {
    const error = new Error('The API returned an unexpected mesh response.')
    error.code = 'BAD_RESPONSE'
    throw error
  }
  return {
    status: data.status,
    model: data.model,
    stage: data.stage,
    vertices_count: data.vertices_count,
    faces_count: data.faces_count,
    latency_ms: data.latency_ms,
    model_init_ms: data.model_init_ms ?? 0,
    total_ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
    vertices: data.vertices,
    faces: data.faces,
  }
}

export function inferenceErrorMessage(error) {
  if (error?.code === 'AUTH_REQUIRED' || error?.response?.status === 401) return 'Your session has ended. Sign in to reconstruct a mesh.'
  if (error?.response?.status === 413) return 'Image exceeds the upload or dimension limit.'
  if (error?.response?.status === 415) return 'The image format does not match its contents. Choose a JPEG, PNG, or WebP image.'
  if (error?.response?.status === 422) return 'The API could not decode this image. Choose another image.'
  if (error?.response?.status === 503) return 'Model inference is unavailable right now. Try again shortly.'
  if (error?.response?.status === 502 || error?.code === 'BAD_RESPONSE') return 'The model returned an invalid mesh. Try again.'
  return 'Reconstruction could not complete. Check the connection and retry.'
}
