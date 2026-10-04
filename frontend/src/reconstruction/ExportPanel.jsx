import { useEffect, useRef, useState } from 'react'
import { formatBytes } from './image.js'
import { validateMeshResponse } from './mesh.js'

export function ExportPanel({ mesh, objectName, sourceFilename }) {
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [sizes, setSizes] = useState({})
  const currentMesh = useRef(mesh)
  currentMesh.current = mesh
  const valid = !validateMeshResponse(mesh)

  useEffect(() => {
    setBusy('')
    setMessage('')
    setSizes({})
  }, [mesh])

  async function download(format) {
    if (!valid || busy) return
    setBusy(format)
    setMessage('')
    try {
      const { serializeStage3, triggerDownload } = await import('./export.js')
      const file = await serializeStage3(mesh, format, { objectName, sourceFilename })
      if (currentMesh.current !== mesh) return
      triggerDownload(file)
      setSizes((previous) => ({ ...previous, [format]: file.sizeBytes }))
      setMessage(`${format.toUpperCase()} is ready. Your browser should start the download.`)
    } catch {
      if (currentMesh.current === mesh) setMessage('EXPORT UNAVAILABLE — Mesh export could not be prepared.')
    } finally {
      if (currentMesh.current === mesh) setBusy('')
    }
  }

  return <section className="recon-export" aria-labelledby="recon-export-title">
    <div className="recon-export-heading">
      <div><p className="recon-eyebrow">04 / ASSET DELIVERY</p><h3 id="recon-export-title">Export mesh.</h3></div>
      <span>{valid ? 'RAW STAGE-3 GEOMETRY' : 'EXPORT UNAVAILABLE'}</span>
    </div>
    {!valid && <p className="recon-inline-error" role="alert">EXPORT UNAVAILABLE — Mesh data failed validation.</p>}
    <div className="recon-export-actions">
      <button type="button" disabled={!valid || Boolean(busy)} onClick={() => download('obj')}>
        <span><strong>Download OBJ</strong><small>Wavefront OBJ · Raw Stage-3 geometry</small></span>
        <span className="recon-export-meta">{sizes.obj ? formatBytes(sizes.obj) : '.OBJ'} ↗</span>
      </button>
      <button type="button" disabled={!valid || Boolean(busy)} onClick={() => download('glb')}>
        <span><strong>{busy === 'glb' ? 'Preparing GLB' : 'Download GLB'}</strong><small>Binary glTF · Neutral 3D asset</small></span>
        <span className="recon-export-meta">{sizes.glb ? formatBytes(sizes.glb) : '.GLB'} ↗</span>
      </button>
    </div>
    <p className="recon-export-status" role="status" aria-live="polite">{message || 'Exports use the original model coordinates, independent of the viewer camera.'}</p>
  </section>
}
