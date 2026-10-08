import { getReconstruction } from './reconstructions.js'
import { downloadPrivate, signedImageUrl } from './storage.js'
import { parseStage3Artifact } from '../reconstruction/meshPersistence.js'

/** Load only the signed-in owner's persisted result; never invoke Pixel2Mesh. */
export async function loadSavedResult(id, services = {}) {
  const getRow = services.getReconstruction ?? getReconstruction
  const sign = services.signedImageUrl ?? signedImageUrl
  const download = services.downloadPrivate ?? downloadPrivate
  const parseArtifact = services.parseArtifact ?? parseStage3Artifact
  const row = await getRow(id)
  if (!row) return { row: null, mesh: null, sourceUrl: '', sourceError: false, artifactError: false }

  let sourceUrl = ''
  let sourceError = false
  let mesh = null
  let artifactError = false
  if (row.source_path) {
    try { sourceUrl = await sign('reconstruction-artifacts', row.source_path) }
    catch { sourceError = true }
  }
  if (row.status === 'completed' || row.status === 'low_volume') {
    try {
      if (!row.mesh_json_path) throw new Error('Missing mesh artifact')
      mesh = await parseArtifact(await download('reconstruction-artifacts', row.mesh_json_path))
    } catch { artifactError = true }
  }
  return { row, mesh, sourceUrl, sourceError, artifactError }
}

/** Re-sign the short-lived private source URL without reloading the mesh or running inference. */
export async function refreshSavedSource(saved, services = {}) {
  if (!saved?.row?.source_path) return saved
  const sign = services.signedImageUrl ?? signedImageUrl
  try {
    const sourceUrl = await sign('reconstruction-artifacts', saved.row.source_path)
    return { ...saved, sourceUrl, sourceError: false }
  } catch {
    return { ...saved, sourceError: true }
  }
}
