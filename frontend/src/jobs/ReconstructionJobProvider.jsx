import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createReconstruction, heartbeatReconstruction, patchReconstruction, renameReconstruction } from '../lib/reconstructions.js'
import { uploadArtifactSet, uploadSource } from '../lib/storage.js'
import { inferImage } from '../lib/inference.js'
import { preflightErrorMessage, preflightImage } from '../lib/preflight.js'
import { inspectImageFile } from '../reconstruction/image.js'
import { deriveObjectName, validateMeshResponse } from '../reconstruction/mesh.js'
import { diagnoseMesh } from '../reconstruction/meshDiagnostics.js'
import { serializeArtifactSet } from '../reconstruction/meshPersistence.js'
import { initialJobState, jobReducer } from './jobReducer.js'
import { retrySave, runReconstruction } from './runJob.js'

const JobContext = createContext(null)

export function ReconstructionJobProvider({ userId, children }) {
  const { pathname } = useLocation()
  const [state, dispatch] = useReducer(jobReducer, initialJobState)
  const [previewUrl, setPreviewUrl] = useState('')
  const controller = useRef(null)
  const active = useRef(false)
  const version = useRef(0)
  const preview = useRef('')
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const releasePreview = useCallback(() => {
    if (preview.current) URL.revokeObjectURL(preview.current)
    preview.current = ''
    setPreviewUrl('')
  }, [])

  useEffect(() => () => {
    version.current += 1
    controller.current?.abort()
    releasePreview()
  }, [releasePreview])

  useEffect(() => {
    if (!state.id || !['processing', 'persisting'].includes(state.phase)) return undefined
    let pending = false
    const timer = window.setInterval(async () => {
      if (pending || !active.current) return
      pending = true
      try { await heartbeatReconstruction(state.id) }
      catch { /* A lost heartbeat is reconciled conservatively after the job stops. */ }
      finally { pending = false }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [state.id, state.phase])

  const reset = useCallback(() => {
    if (active.current) return false
    version.current += 1
    releasePreview()
    dispatch({ type: 'reset' })
    return true
  }, [releasePreview])

  const selectFile = useCallback(async (file) => {
    if (!file || active.current) return false
    const runId = ++version.current
    releasePreview()
    dispatch({ type: 'selected', runId, selection: null, objectName: deriveObjectName(file.name) })
    try {
      const selection = await inspectImageFile(file)
      if (runId !== version.current) return false
      preview.current = URL.createObjectURL(file)
      setPreviewUrl(preview.current)
      dispatch({ type: 'selected', runId: runId + 1, selection, objectName: deriveObjectName(file.name) })
      version.current = runId + 1
      return true
    } catch (error) {
      if (runId === version.current) dispatch({ type: 'failed', runId, kind: 'selection', message: error.message })
      return false
    }
  }, [releasePreview])

  const setObjectName = useCallback((value) => dispatch({ type: 'object_name', runId: version.current, value: value.slice(0, 80) }), [])
  const saveObjectName = useCallback(async () => {
    if (!state.id || !['completed', 'low_volume'].includes(state.phase)) return false
    await renameReconstruction(state.id, state.objectName)
    return true
  }, [state.id, state.phase, state.objectName])

  const runPreflight = useCallback(async () => {
    if (!state.selection?.file || active.current) return false
    const runId = version.current
    const abort = new AbortController()
    controller.current = abort
    dispatch({ type: 'preflighting', runId })
    try {
      const verified = await preflightImage(state.selection.file, { signal: abort.signal })
      if (runId !== version.current || abort.signal.aborted) return false
      dispatch({ type: 'ready', runId, verified })
      return true
    } catch (error) {
      if (runId === version.current && !abort.signal.aborted) {
        dispatch({ type: 'failed', runId, kind: 'preflight', message: preflightErrorMessage(error) })
      }
      return false
    } finally { if (controller.current === abort) controller.current = null }
  }, [state.selection])

  const services = useMemo(() => ({ createReconstruction, patchReconstruction, uploadSource,
    uploadArtifactSet, inferImage, validateMesh: validateMeshResponse, diagnoseMesh, serializeArtifactSet }), [])

  const startReconstruction = useCallback(async () => {
    if (active.current || !state.selection?.file || !state.verified) return null
    active.current = true
    const runId = version.current
    const abort = new AbortController()
    controller.current = abort
    const snapshot = { userId, file: state.selection.file, objectName: state.objectName, verified: state.verified }
    try {
      return await runReconstruction(snapshot, services, {
        signal: abort.signal,
        onEvent: (event) => {
          if (runId !== version.current || abort.signal.aborted) return
          const finished = event.type === 'completed' || event.type === 'low_volume'
          const notice = finished && pathnameRef.current !== '/reconstruct'
            ? { message: `${snapshot.objectName || 'Your'} reconstruction finished.` } : null
          dispatch({ ...event, runId, notice })
        },
      })
    } catch { return null }
    finally {
      active.current = false
      if (controller.current === abort) controller.current = null
    }
  }, [services, state.selection, state.verified, state.objectName, userId])

  const retryPersistence = useCallback(async () => {
    if (active.current || state.failureKind !== 'persistence' || !state.mesh || !state.id) return null
    active.current = true
    const runId = version.current
    const snapshot = { userId, file: state.selection.file, objectName: state.objectName, verified: state.verified }
    dispatch({ type: 'persisting', runId, mesh: state.mesh, diagnostic: state.diagnostic })
    try {
      return await retrySave(snapshot, state.mesh, state.id, services, {
        onEvent: (event) => { if (runId === version.current) dispatch({ ...event, runId }) },
      })
    } catch {
      dispatch({ type: 'failed', runId, kind: 'persistence', mesh: state.mesh, message: 'Saving is still incomplete. Try again.' })
      return null
    }
    finally { active.current = false }
  }, [services, state, userId])

  const dismissNotice = useCallback(() => dispatch({ type: 'dismiss_notice', runId: version.current }), [])
  const value = useMemo(() => ({ state, previewUrl, selectFile, setObjectName, saveObjectName, runPreflight,
    startReconstruction, retryPersistence, reset, dismissNotice }),
  [state, previewUrl, selectFile, setObjectName, saveObjectName, runPreflight, startReconstruction, retryPersistence, reset, dismissNotice])
  return <JobContext.Provider value={value}>{children}</JobContext.Provider>
}

export function useReconstructionJob() {
  const value = useContext(JobContext)
  if (!value) throw new Error('Reconstruction job provider is missing')
  return value
}
