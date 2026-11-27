import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { useAuth } from '../auth/AuthProvider'
import { getTriposrReadiness, inferTriposrImage, triposrErrorMessage } from '../lib/triposr.js'
import { saveTriposrOutput } from '../lib/triposrHistory.js'
import { inspectImageFile } from './image.js'
import { TriposrMeshViewer } from './TriposrMeshViewer.jsx'
import { downloadTriposrAsset, exportTriposrMesh } from './triposrExport.js'
import './calibratedReconstruction.css'
import './TriposrMeshViewer.css'

export function TriposrReconstructionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [service, setService] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [viewerVersion, setViewerVersion] = useState(0)

  const refreshReadiness = useCallback(async () => {
    setService('checking')
    const result = await getTriposrReadiness()
    setService(result.ready ? 'ready' : 'unavailable')
  }, [])

  useEffect(() => { void refreshReadiness() }, [refreshReadiness])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function chooseFile(file) {
    setError(''); setSaveMessage(''); setPrediction(null); setSelected(null)
    if (!file) return
    try {
      const inspected = await inspectImageFile(file)
      setSelected(inspected)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return URL.createObjectURL(file)
      })
    } catch (reason) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return ''
      })
      setError(reason.message || 'Choose a valid image file.')
    }
  }

  async function reconstruct() {
    if (!selected || service !== 'ready' || busy) return
    setBusy(true); setError(''); setSaveMessage(''); setPrediction(null)
    try {
      setPrediction(await inferTriposrImage(selected.file))
    } catch (reason) {
      setError(triposrErrorMessage(reason))
      if (reason?.response?.status === 503) setService('unavailable')
    } finally { setBusy(false) }
  }

  async function download(format) {
    try { downloadTriposrAsset(await exportTriposrMesh(prediction, format)) }
    catch { setError(`The ${format.toUpperCase()} export could not be prepared.`) }
  }

  async function saveHistory() {
    if (!selected || !prediction || !user?.id || busy) return
    setBusy(true); setError(''); setSaveMessage('Saving privately to your history…')
    try {
      const row = await saveTriposrOutput({ userId: user.id, file: selected.file,
        width: selected.width, height: selected.height, prediction })
      navigate(`/reconstructions/${encodeURIComponent(row.id)}`)
    } catch {
      setSaveMessage(''); setError('The mesh was generated, but private history could not be saved. You can still download it.')
    } finally { setBusy(false) }
  }

  const statusText = service === 'checking' ? 'Checking the TripoSR service…' :
    service === 'ready' ? 'TripoSR is ready for single-image reconstruction.' :
      'TripoSR is unavailable. Your image remains in this browser until you start a request.'

  return <main className="calibrated-reconstruction" id="main-content">
    <header className="reconstruction-heading">
      <p className="calibrated-eyebrow">IMAGE RECONSTRUCTION</p>
      <h1>Reconstruct from one photo.</h1>
      <p>Upload a product photograph. TripoSR estimates a colored 3D mesh and does not require camera JSON.</p>
    </header>
    <div className="reconstruction-layout">
      <section className="reconstruction-upload-card" aria-labelledby="triposr-upload-title">
        <div><p className="calibrated-eyebrow">YOUR INPUT</p><h2 id="triposr-upload-title">Product photograph</h2>
          <p className="reconstruction-copy">JPEG, PNG, or WebP up to 10 MB. Background removal runs automatically after you request a reconstruction.</p></div>
        <label className="reconstruction-file-control" htmlFor="triposr-image"><span>{selected ? 'Choose another image' : 'Choose image'}</span>
          <input id="triposr-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseFile(event.target.files?.[0]) }} />
        </label>
        {error && <p className="reconstruction-error" role="alert">{error}</p>}
        {selected && <div className="reconstruction-preview-wrap"><img src={previewUrl} alt="Selected product photograph" className="reconstruction-preview" />
          <p>{selected.width} × {selected.height} pixels · {selected.format}</p></div>}
        <div className={'reconstruction-service-state is-' + service} role="status" aria-live="polite"><span className="reconstruction-service-indicator" aria-hidden="true" /><p>{statusText}</p></div>
        <button className="reconstruction-submit" type="button" disabled={!selected || service !== 'ready' || busy} onClick={() => { void reconstruct() }}>
          {busy && !prediction ? 'Reconstructing…' : 'Reconstruct image'}
        </button>
        <button className="reconstruction-retry" type="button" onClick={() => { void refreshReadiness() }} disabled={service === 'checking' || busy}>
          {service === 'checking' ? 'Checking…' : 'Check service again'}
        </button>
      </section>

      <section className="reconstruction-output-card" aria-labelledby="triposr-result-title">
        <p className="calibrated-eyebrow">PREDICTED MESH</p>
        <h2 id="triposr-result-title">{prediction ? 'TripoSR reconstruction' : busy ? 'Creating your mesh…' : 'Your result will appear here'}</h2>
        {prediction ? <>
          <TriposrMeshViewer key={viewerVersion} prediction={prediction} />
          <p className="reconstruction-copy">{prediction.vertices_count.toLocaleString()} vertices · {prediction.faces_count.toLocaleString()} faces · {Math.round(prediction.latency_ms).toLocaleString()} ms inference</p>
          <div className="triposr-result-actions">
            <button type="button" className="reconstruction-retry" onClick={() => setViewerVersion((value) => value + 1)}>Reset view</button>
            <button type="button" className="reconstruction-retry" onClick={() => { void download('obj') }}>Download OBJ</button>
            <button type="button" className="reconstruction-retry" onClick={() => { void download('glb') }}>Download GLB</button>
            <button type="button" className="reconstruction-submit" disabled={busy} onClick={() => { void saveHistory() }}>Save to history</button>
          </div>
          {saveMessage && <p role="status">{saveMessage}</p>}
          <p className="reconstruction-copy">Generated with official pretrained TripoSR weights. A single image cannot reveal unseen object surfaces reliably.</p>
        </> : <div className="reconstruction-output-empty">
          <div className="reconstruction-output-mark" aria-hidden="true"><span /><span /><span /></div>
          <p>The result will come from a new authenticated inference request. No saved gallery or ground-truth mesh is used as a substitute.</p>
        </div>}
        <Link className="reconstruction-history-link" to="/history">Open saved reconstruction history <Arrow diagonal /></Link>
      </section>
    </div>
  </main>
}
