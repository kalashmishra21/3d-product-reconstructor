import { api } from './api.js'
import { getCurrentSession } from './auth.js'

const CHECKPOINT_SHA256 = '429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee'
const finitePoint = (point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)

export function validateTriposrPrediction(data) {
  if (data?.schema_version !== 3 || data.status !== 'complete' || data.model !== 'TripoSR' ||
      data.engine !== 'stabilityai/TripoSR' || data.model_version !== CHECKPOINT_SHA256 ||
      data.output_type !== 'colored_triangle_mesh' || !Number.isFinite(data.latency_ms) || data.latency_ms < 0 ||
      !Number.isInteger(data.vertices_count) || data.vertices_count < 3 || data.vertices_count > 1000000 ||
      !Number.isInteger(data.faces_count) || data.faces_count < 1 || data.faces_count > 2000000 ||
      !Array.isArray(data.vertices) || data.vertices.length !== data.vertices_count ||
      !data.vertices.every(finitePoint) || !Array.isArray(data.faces) || data.faces.length !== data.faces_count ||
      !Array.isArray(data.vertex_colors) || data.vertex_colors.length !== data.vertices_count) return false
  if (data.faces.some((face) => !Array.isArray(face) || face.length !== 3 ||
      new Set(face).size !== 3 || face.some((index) => !Number.isInteger(index) || index < 0 || index >= data.vertices_count))) return false
  return data.vertex_colors.every((color) => Array.isArray(color) && color.length >= 3 && color.length <= 4 &&
    color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255))
}

export async function inferTriposrImage(file, { signal, client = api, sessionProvider = getCurrentSession } = {}) {
  const session = await sessionProvider()
  if (!session?.access_token) {
    const error = new Error('Your session has ended. Sign in to reconstruct a mesh.')
    error.code = 'AUTH_REQUIRED'
    throw error
  }
  const form = new FormData()
  form.append('image', file, file.name)
  const { data } = await client.post('/api/v1/triposr/reconstruct', form, {
    headers: { Authorization: `Bearer ${session.access_token}` }, signal, timeout: 240000,
  })
  if (!validateTriposrPrediction(data)) {
    const error = new Error('The inference service returned invalid TripoSR geometry.')
    error.code = 'BAD_RESPONSE'
    throw error
  }
  return data
}

export async function getTriposrReadiness({ client = api, sessionProvider = getCurrentSession } = {}) {
  const session = await sessionProvider()
  if (!session?.access_token) return { ready: false, reason: 'authentication_required' }
  try {
    const { data } = await client.get('/api/v1/triposr/readiness', {
      headers: { Authorization: `Bearer ${session.access_token}` }, timeout: 180000,
    })
    return data?.ready === true && data?.model === 'TripoSR'
      ? { ready: true, reason: null, model: data.model, device: data.device }
      : { ready: false, reason: 'model_not_ready' }
  } catch (error) {
    return { ready: false, reason: error?.response?.status === 401 ? 'authentication_required' : 'service_unavailable' }
  }
}

export function triposrErrorMessage(error) {
  if (error?.code === 'AUTH_REQUIRED' || error?.response?.status === 401) return 'Your session has ended. Sign in again to reconstruct.'
  if (error?.response?.status === 413) return 'This image exceeds the 10 MB upload limit.'
  if (error?.response?.status === 415) return 'Choose a JPEG, PNG, or WebP image that matches its file contents.'
  if (error?.response?.status === 422) return 'The image could not be decoded. Try another image.'
  if (error?.response?.status === 503) return 'TripoSR inference is offline or busy. Try again shortly.'
  if (error?.response?.status === 502 || error?.code === 'BAD_RESPONSE') return 'TripoSR did not return a valid mesh. Try another image.'
  return 'Reconstruction could not complete. Check the connection and try again.'
}
