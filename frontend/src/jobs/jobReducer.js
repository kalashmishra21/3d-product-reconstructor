export const initialJobState = Object.freeze({
  phase: 'idle', runId: 0, selection: null, objectName: '', verified: null,
  id: null, mesh: null, diagnostic: null, error: '', failureKind: '', notice: null,
})

const ACTIVE = new Set(['processing', 'persisting'])

export function jobReducer(state, event) {
  if (event.type === 'reset') return { ...initialJobState, runId: state.runId + 1 }
  if (event.type === 'selected') {
    if (event.runId <= state.runId) return state
    return { ...initialJobState, runId: event.runId, phase: 'selected', selection: event.selection, objectName: event.objectName ?? '' }
  }
  if (event.runId !== state.runId) return state
  if (event.type === 'object_name') return { ...state, objectName: event.value }
  if (event.type === 'preflighting' && state.selection && !ACTIVE.has(state.phase)) return { ...state, phase: 'preflighting', verified: null, error: '' }
  if (event.type === 'ready' && state.phase === 'preflighting') return { ...state, phase: 'ready', verified: event.verified, error: '' }
  if (event.type === 'processing' && (state.phase === 'ready' || state.phase === 'selected' ||
      (state.verified && ['completed', 'low_volume', 'failed'].includes(state.phase)))) {
    return { ...state, phase: 'processing', id: event.id, mesh: null, diagnostic: null, error: '', failureKind: '', notice: null }
  }
  if (event.type === 'persisting' && (state.phase === 'processing' ||
      (state.phase === 'failed' && state.failureKind === 'persistence'))) {
    return { ...state, phase: 'persisting', mesh: event.mesh, diagnostic: event.diagnostic ?? state.diagnostic, error: '', failureKind: '' }
  }
  if (event.type === 'completed' && ACTIVE.has(state.phase)) return { ...state, phase: 'completed', mesh: event.mesh, diagnostic: event.diagnostic, notice: event.notice ?? null }
  if (event.type === 'low_volume' && ACTIVE.has(state.phase)) return { ...state, phase: 'low_volume', mesh: event.mesh, diagnostic: event.diagnostic, notice: event.notice ?? null }
  if (event.type === 'failed') return { ...state, phase: 'failed', error: event.message, failureKind: event.kind ?? 'unknown', mesh: event.mesh ?? state.mesh }
  if (event.type === 'interrupted') return { ...state, phase: 'interrupted', error: event.message ?? '' }
  if (event.type === 'dismiss_notice') return { ...state, notice: null }
  return state
}
