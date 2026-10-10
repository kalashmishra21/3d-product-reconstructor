const SAFE_FAILURE = 'Reconstruction could not complete. Please try again.'
const SOURCE_PATCH_TIMEOUT_MS = 30_000
const FAILURE_PATCH_TIMEOUT_MS = 10_000

function withinDeadline(promise, milliseconds, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
  ]).finally(() => clearTimeout(timer))
}

/** One browser-owned run: create row, preserve source, infer once, then persist the same raw mesh. */
export async function runReconstruction(snapshot, services, {
  signal, onEvent = () => {}, sourcePatchTimeoutMs = SOURCE_PATCH_TIMEOUT_MS,
  failurePatchTimeoutMs = FAILURE_PATCH_TIMEOUT_MS,
} = {}) {
  const { userId, file, objectName, verified } = snapshot
  if (!userId || !file || !verified || verified.user_id && verified.user_id !== userId) throw new Error('Verified input is required')
  let row
  try {
    row = await services.createReconstruction({
      userId, objectName, filename: file.name, mime: file.type,
      width: verified.width, height: verified.height, sizeBytes: file.size,
    })
  } catch (error) {
    onEvent({ type: 'failed', kind: 'database', message: 'Could not start a saved reconstruction. Try again.' })
    throw error
  }
  onEvent({ type: 'processing', id: row.id })
  let mesh
  let sourceConfirmed = false
  try {
    const sourcePath = await services.uploadSource(userId, row.id, file)
    await withinDeadline(
      services.patchReconstruction(row.id, { source_path: sourcePath }, { expectedStatus: 'processing' }),
      sourcePatchTimeoutMs, 'Source confirmation timed out',
    )
    sourceConfirmed = true
    if (signal?.aborted) throw new Error('Reconstruction interrupted')
    const predicted = await services.inferImage(file, { signal })
    if (services.validateMesh(predicted)) throw new Error('The model returned invalid mesh data')
    mesh = predicted
    const diagnostic = services.diagnoseMesh(mesh.vertices)
    onEvent({ type: 'persisting', id: row.id, mesh, diagnostic })
    return await retrySave(snapshot, mesh, row.id, services, { signal, onEvent, diagnostic })
  } catch (error) {
    if (signal?.aborted) {
      await interruptLiveJob(row.id, services)
      onEvent({ type: 'interrupted', id: row.id, message: 'Reconstruction interrupted.' })
      throw error
    }
    if (mesh) {
      error.kind = 'persistence'
      error.mesh = mesh
      error.id = row.id
      onEvent({ type: 'failed', kind: 'persistence', message: 'Mesh generated, but saving is incomplete. Retry save.', mesh })
    } else {
      await withinDeadline(
        services.patchReconstruction(row.id, { status: 'failed', error_message: SAFE_FAILURE }, { expectedStatus: 'processing' }),
        failurePatchTimeoutMs, 'Failure status update timed out',
      ).catch(() => {})
      onEvent({ type: 'failed', kind: sourceConfirmed ? 'inference' : 'database',
        message: sourceConfirmed ? SAFE_FAILURE : 'Could not confirm the saved source image. Check the connection and try again.' })
    }
    throw error
  }
}

/** Best-effort compare-and-set while the owner's Supabase session still exists. */
export async function interruptLiveJob(id, services) {
  if (!id) return null
  try { return await services.patchReconstruction(id, { status: 'interrupted' }, { expectedStatus: 'processing' }) }
  catch { return null }
}

/** Persistence-only retry never touches Pixel2Mesh. */
export async function retrySave(snapshot, mesh, rowId, services, { signal, onEvent = () => {}, diagnostic } = {}) {
  if (services.validateMesh(mesh)) throw new Error('MESH DATA INVALID')
  if (signal?.aborted) throw new Error('Reconstruction interrupted')
  const shape = diagnostic ?? services.diagnoseMesh(mesh.vertices)
  const set = await services.serializeArtifactSet(mesh, { objectName: snapshot.objectName, sourceFilename: snapshot.file.name })
  const paths = await services.uploadArtifactSet(snapshot.userId, rowId, set, { upsert: true })
  const status = shape?.degenerate ? 'low_volume' : 'completed'
  const patch = {
    status, model_name: mesh.model, stage: mesh.stage,
    vertices_count: mesh.vertices_count, faces_count: mesh.faces_count,
    inference_ms: mesh.latency_ms, model_init_ms: mesh.model_init_ms ?? 0, total_ms: mesh.total_ms ?? null,
    mesh_json_path: paths.json, obj_path: paths.obj, glb_path: paths.glb,
    obj_size_bytes: set.obj.sizeBytes, glb_size_bytes: set.glb.sizeBytes,
  }
  const row = await services.patchReconstruction(rowId, patch, { expectedStatus: 'processing' })
  onEvent({ type: status, id: rowId, mesh, diagnostic: shape, row })
  return { row, mesh, diagnostic: shape, status }
}
