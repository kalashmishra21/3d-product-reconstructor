const SAFE_FAILURE = 'Reconstruction could not complete. Please try again.'

/** One browser-owned run: create row, preserve source, infer once, then persist the same raw mesh. */
export async function runReconstruction(snapshot, services, { signal, onEvent = () => {} } = {}) {
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
  try {
    const sourcePath = await services.uploadSource(userId, row.id, file)
    await services.patchReconstruction(row.id, { source_path: sourcePath }, { expectedStatus: 'processing' })
    if (signal?.aborted) throw new Error('Reconstruction interrupted')
    const predicted = await services.inferImage(file, { signal })
    if (services.validateMesh(predicted)) throw new Error('The model returned invalid mesh data')
    mesh = predicted
    const diagnostic = services.diagnoseMesh(mesh.vertices)
    onEvent({ type: 'persisting', id: row.id, mesh, diagnostic })
    return await retrySave(snapshot, mesh, row.id, services, { signal, onEvent, diagnostic })
  } catch (error) {
    if (mesh) {
      error.kind = 'persistence'
      error.mesh = mesh
      error.id = row.id
      onEvent({ type: 'failed', kind: 'persistence', message: 'Mesh generated, but saving is incomplete. Retry save.', mesh })
    } else {
      await services.patchReconstruction(row.id, { status: 'failed', error_message: SAFE_FAILURE }, { expectedStatus: 'processing' }).catch(() => {})
      onEvent({ type: 'failed', kind: 'inference', message: SAFE_FAILURE })
    }
    throw error
  }
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
