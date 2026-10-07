import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'
import { loadSavedResult, refreshSavedSource } from '../lib/resultDetail.js'
import { interruptStaleReconstruction } from '../lib/reconstructions.js'
import { classifyProcessing, STALE_AFTER_MS } from '../jobs/stale.js'
import { downloadPrivate } from '../lib/storage.js'
import { ExportPanel } from '../reconstruction/ExportPanel.jsx'
import { formatMilliseconds } from '../reconstruction/mesh.js'
import { diagnoseMesh } from '../reconstruction/meshDiagnostics.js'
import { ResultViewport } from '../reconstruction/ResultViewport.jsx'
import { SourceView } from '../reconstruction/SourceView.jsx'
import '../reconstruction/reconstruction.css'

const READY = new Set(['completed', 'low_volume'])
const statusLabel = { processing: 'PROCESSING', completed: 'COMPLETED', low_volume: 'LOW VOLUME', failed: 'FAILED', interrupted: 'INTERRUPTED' }

export default function ResultDetail() {
  const { id } = useParams()
  const { state: job } = useReconstructionJob()
  const [saved, setSaved] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [view, setView] = useState('mesh')
  const liveJobPhase = job.id === id && ['processing', 'persisting'].includes(job.phase) ? job.phase : null

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    loadSavedResult(id).then(async (result) => {
      if (classifyProcessing(result.row, liveJobPhase ? id : null) === 'stale') {
        const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
        try {
          const updated = await interruptStaleReconstruction(id, cutoff)
          result = updated ? { ...result, row: updated } : await loadSavedResult(id)
        } catch { /* Preserve the saved row if reconciliation is temporarily unavailable. */ }
      }
      if (active) setSaved(result)
    })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, liveJobPhase])

  useEffect(() => {
    if (!saved?.row?.source_path) return undefined
    let active = true
    const timer = window.setInterval(() => {
      refreshSavedSource(saved).then((updated) => {
        if (active) setSaved((current) => current?.row?.id === updated.row.id
          ? { ...current, sourceUrl: updated.sourceUrl, sourceError: updated.sourceError } : current)
      })
    }, 90_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [saved?.row?.id, saved?.row?.source_path])

  function onTabKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = view === 'mesh' ? 'input' : 'mesh'
    setView(next)
    event.currentTarget.parentElement.querySelector(`[data-view="${next}"]`)?.focus()
  }

  const row = saved?.row
  const mesh = saved?.mesh
  const hasResult = row && READY.has(row.status) && mesh && !saved.artifactError
  const diagnostic = hasResult ? diagnoseMesh(mesh.vertices) : null

  async function prepareStoredExport(_mesh, format, { objectName, sourceFilename }) {
    const path = format === 'obj' ? row.obj_path : format === 'glb' ? row.glb_path : null
    if (!path) throw new Error('Saved export unavailable')
    const blob = await downloadPrivate('reconstruction-artifacts', path)
    if (!blob?.size) throw new Error('Saved export empty')
    const { exportStem } = await import('../reconstruction/export.js')
    return { blob, filename: `${exportStem(objectName, sourceFilename)}-stage3.${format}`, sizeBytes: blob.size }
  }

  return <section className="workspace-page result-detail-page" aria-labelledby="result-detail-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">SAVED RECONSTRUCTION</p><h1 id="result-detail-title">{row?.object_name || (loading ? 'Opening your result.' : 'Reconstruction result')}</h1><p>Private source and real Stage-3 geometry, saved to your workspace.</p></div><Link className="dash-text-link" to="/history">Back to history <Arrow /></Link></div>

    {loading && <p className="result-detail-state" role="status">Opening your saved reconstruction…</p>}
    {!loading && error && <p className="result-detail-state" role="alert">This result could not be opened. Try again from History.</p>}
    {!loading && !error && !row && <div className="result-detail-state"><h2>Reconstruction not found.</h2><p>This link may not exist or may not belong to this account.</p><Link className="button primary" to="/history">Open History <Arrow diagonal /></Link></div>}

    {!loading && !error && row && <div className="result-detail-grid">
      <section className="recon-view-panel is-result" aria-label="Saved result inspection">
        <div className="recon-view-header"><div><p className="recon-eyebrow">{view === 'mesh' ? 'SAVED MODEL OUTPUT / 003' : 'SAVED SOURCE IMAGE / 001'}</p><h2>{view === 'mesh' ? 'Real Stage-3 mesh' : 'Input inspection'}</h2></div><span className="recon-live-label">{statusLabel[row.status] || 'SAVED'}</span></div>
        <div className="result-view-tabs" role="tablist" aria-label="Inspect saved result or source">
          <button type="button" role="tab" data-view="mesh" aria-selected={view === 'mesh'} tabIndex={view === 'mesh' ? 0 : -1} onClick={() => setView('mesh')} onKeyDown={onTabKey}>RESULT</button>
          <button type="button" role="tab" data-view="input" aria-selected={view === 'input'} tabIndex={view === 'input' ? 0 : -1} onClick={() => setView('input')} onKeyDown={onTabKey}>INPUT</button>
        </div>
        {view === 'mesh' && diagnostic?.degenerate && <div className="recon-volume-note" role="status"><strong>Low-volume reconstruction</strong><p>The current model produced limited geometric depth for this image.</p><span>Raw OBJ / GLB exports remain available.</span></div>}
        {view === 'mesh' && hasResult && <ResultViewport mesh={mesh} objectName={row.object_name} />}
        {view === 'mesh' && !hasResult && <div className="result-detail-state" role="status">{saved.artifactError ? 'Saved mesh data could not be validated.' : row.status === 'processing' ? 'This reconstruction may still be processing in another browser session.' : row.status === 'failed' ? 'This reconstruction did not complete.' : row.status === 'interrupted' ? 'This browser-owned reconstruction was interrupted. Start a new one with the source image.' : 'No saved mesh is available.'}</div>}
        {view === 'input' && saved.sourceUrl && <SourceView src={saved.sourceUrl} filename={row.source_filename} width={row.source_width} height={row.source_height} />}
        {view === 'input' && !saved.sourceUrl && <div className="result-detail-state" role="status">{saved.sourceError ? 'The private source image could not be opened.' : 'No source image is saved for this reconstruction.'}</div>}
        <div className="recon-view-foot"><span>{view === 'mesh' ? 'PERSISTED RAW MODEL GEOMETRY' : 'ORIGINAL PRIVATE SOURCE IMAGE'}</span><span>{hasResult && view === 'mesh' ? `${mesh.vertices_count.toLocaleString()} VERTICES / ${mesh.faces_count.toLocaleString()} FACES` : row.source_filename}</span></div>
      </section>

      <aside className="result-detail-sidebar"><div className="result-detail-meta"><p className="dash-kicker">RECONSTRUCTION RECORD</p><h2>{row.object_name || 'Untitled reconstruction'}</h2><p>{row.source_filename}</p><dl><div><dt>Status</dt><dd>{statusLabel[row.status] || row.status}</dd></div><div><dt>Model</dt><dd>{row.model_name || '—'}</dd></div><div><dt>Stage</dt><dd>{row.stage ? String(row.stage).padStart(2, '0') : '—'}</dd></div><div><dt>Vertices</dt><dd>{row.vertices_count?.toLocaleString() || '—'}</dd></div><div><dt>Faces</dt><dd>{row.faces_count?.toLocaleString() || '—'}</dd></div><div><dt>Inference</dt><dd>{row.inference_ms != null ? formatMilliseconds(Number(row.inference_ms)) : '—'}</dd></div></dl></div>
        {hasResult && row.obj_path && row.glb_path && <ExportPanel mesh={mesh} objectName={row.object_name || ''} sourceFilename={row.source_filename} prepareExport={prepareStoredExport} />}
        <Link className="dash-text-link" to="/reconstruct">New Reconstruction <Arrow diagonal /></Link>
      </aside>
    </div>}
  </section>
}
