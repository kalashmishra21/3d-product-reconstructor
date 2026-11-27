import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { useAuth } from '../auth/AuthProvider'
import { getHealth } from '../lib/api.js'
import { preflightErrorMessage, preflightImage } from '../lib/preflight.js'
import { getTriposrReadiness, inferTriposrImage, triposrErrorMessage } from '../lib/triposr.js'
import { saveTriposrOutput } from '../lib/triposrHistory.js'
import { inspectImageFile, formatBytes } from './image.js'
import { TriposrMeshViewer } from './TriposrMeshViewer.jsx'
import { downloadTriposrAsset, exportTriposrMesh } from './triposrExport.js'
import './calibratedReconstruction.css'
import './TriposrMeshViewer.css'

const PREFLIGHT_STEPS = [
  ['image', 'Image format, size, and decoding'],
  ['auth', 'Signed-in session'],
  ['api', 'Application API'],
  ['engine', 'Reconstruction service'],
]

export function TriposrReconstructionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [preflight, setPreflight] = useState(null)
  const [activity, setActivity] = useState('idle')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [activeTab, setActiveTab] = useState('result')
  const busy = activity !== 'idle'

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function chooseFile(file) {
    if (!file) return
    setError('')
    setSaveMessage('')
    setPrediction(null)
    setPreflight(null)
    setActiveTab('input')
    try {
      const inspected = await inspectImageFile(file)
      setSelected(inspected)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return URL.createObjectURL(file)
      })
    } catch (reason) {
      setSelected(null)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return ''
      })
      setError(reason.message || 'Choose a valid image file.')
    }
  }

  function removeImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelected(null)
    setPreviewUrl('')
    setPrediction(null)
    setPreflight(null)
    setError('')
    setSaveMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function runPreflight() {
    if (!selected || busy) return
    setActivity('preflight')
    setError('')
    setPrediction(null)
    setPreflight({ checks: { image: 'passed', auth: user ? 'checking' : 'failed', api: 'checking', engine: 'checking' }, passed: false })
    const checks = { image: 'passed', auth: user ? 'passed' : 'failed', api: 'checking', engine: 'checking' }
    try {
      if (!user) {
        checks.api = 'not-run'
        checks.engine = 'not-run'
        throw Object.assign(new Error('Sign in to check readiness and reconstruct an image.'), { code: 'AUTH_REQUIRED' })
      }

      try {
        await getHealth()
        checks.api = 'passed'
      } catch {
        checks.api = 'failed'
        checks.engine = 'not-run'
        throw Object.assign(new Error('The application API could not be reached. Check the service connection and try again.'), { code: 'API_UNAVAILABLE' })
      }

      try {
        const response = await preflightImage(selected.file)
        checks.image = response.status === 'ready' ? 'passed' : 'failed'
      } catch (reason) {
        if (reason?.code === 'AUTH_REQUIRED' || reason?.response?.status === 401) checks.auth = 'failed'
        else checks.image = 'failed'
        checks.engine = 'not-run'
        throw reason
      }

      const readiness = await getTriposrReadiness()
      if (readiness.reason === 'authentication_required') checks.auth = 'failed'
      checks.engine = readiness.ready ? 'passed' : 'failed'
      if (!readiness.ready) {
        const unavailable = new Error(readiness.reason === 'authentication_required'
          ? 'Sign in again to check model readiness.'
          : 'The reconstruction service is unavailable right now. Try again later.')
        unavailable.code = readiness.reason === 'authentication_required' ? 'AUTH_REQUIRED' : 'SERVICE_UNAVAILABLE'
        throw unavailable
      }

      setPreflight({ checks, passed: true })
    } catch (reason) {
      setPreflight({ checks, passed: false })
      setError(reason?.code === 'API_UNAVAILABLE' || reason?.code === 'AUTH_REQUIRED' || reason?.code === 'SERVICE_UNAVAILABLE'
        ? reason.message
        : preflightErrorMessage(reason))
    } finally {
      setActivity('idle')
    }
  }

  async function reconstruct() {
    if (!selected || !preflight?.passed || busy) return
    setActivity('inference')
    setError('')
    setSaveMessage('')
    setPrediction(null)
    setActiveTab('result')
    try {
      setPrediction(await inferTriposrImage(selected.file))
    } catch (reason) {
      setError(triposrErrorMessage(reason))
      if (reason?.response?.status === 503) {
        setPreflight((current) => current ? { ...current, passed: false, checks: { ...current.checks, engine: 'failed' } } : current)
      }
    } finally { setActivity('idle') }
  }

  async function download(format) {
    try { downloadTriposrAsset(await exportTriposrMesh(prediction, format)) }
    catch { setError(`The ${format.toUpperCase()} export could not be prepared.`) }
  }

  async function saveHistory() {
    if (!selected || !prediction || !user?.id || busy) return
    setActivity('saving')
    setError('')
    setSaveMessage('Saving to your private history…')
    try {
      const row = await saveTriposrOutput({ userId: user.id, file: selected.file,
        width: selected.width, height: selected.height, prediction })
      navigate(`/reconstructions/${encodeURIComponent(row.id)}`)
    } catch {
      setSaveMessage('')
      setError('The model is ready, but it could not be saved. You can still download it.')
    } finally { setActivity('idle') }
  }

  const canReconstruct = Boolean(selected && preflight?.passed && !busy)

  return <main className="calibrated-reconstruction" id="main-content">
    <header className="reconstruction-heading">
      <p className="calibrated-eyebrow">PIXEL3MESH WORKSPACE</p>
      <h1>Explore a product in 3D.</h1>
      <p>Choose one product photo, confirm it is ready, then create an interactive 3D estimate.</p>
    </header>

    <div className="reconstruction-layout triposr-workspace">
      <section className="reconstruction-upload-card triposr-input-panel" aria-labelledby="triposr-upload-title">
        <div className="triposr-panel-heading"><div><p className="calibrated-eyebrow">01 · INPUT</p><h2 id="triposr-upload-title">Product photo</h2></div>
          {selected && <span className="triposr-file-size">{formatBytes(selected.file.size)}</span>}</div>
        <p className="reconstruction-copy">JPEG, PNG, or WebP · up to 10 MB · automatic image preparation</p>

        {selected ? <div className="triposr-selected-file">
          <div className="triposr-preview-frame"><img src={previewUrl} alt="Selected product photograph" className="reconstruction-preview" /></div>
          <div className="triposr-image-details"><strong>{selected.file.name}</strong><span>{selected.width} × {selected.height} px · {selected.format}</span></div>
          <div className="triposr-image-actions">
            <button className="triposr-secondary-button" type="button" onClick={() => inputRef.current?.click()}>Replace image</button>
            <button className="triposr-text-button" type="button" onClick={removeImage}>Remove</button>
          </div>
        </div> : <label className={`triposr-dropzone ${dragging ? 'is-dragging' : ''}`} htmlFor="triposr-image"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseFile(event.dataTransfer.files?.[0]) }}>
          <input ref={inputRef} id="triposr-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} />
          <span className="triposr-upload-mark" aria-hidden="true">↑</span>
          <strong>Drop a product photo here</strong>
          <span>or <span className="triposr-browse-link">browse files</span></span>
          <small>JPEG · PNG · WebP · 10 MB maximum</small>
        </label>}

        {error && <p className="reconstruction-error" role="alert">{error}</p>}

        <div className="triposr-preflight-block">
          <div className="triposr-step-label"><span>02</span><strong>Readiness check</strong></div>
          <p className="reconstruction-copy">Checks this image, your sign-in, the API, and model availability. It does not generate a mesh.</p>
          <button className="triposr-secondary-button triposr-preflight-button" type="button" disabled={!selected || busy} onClick={() => { void runPreflight() }}>
            {busy && !prediction ? 'Checking readiness…' : 'Run preflight'}
          </button>
          {preflight && <div className={`triposr-checklist ${preflight.passed ? 'is-passed' : 'is-incomplete'}`} aria-live="polite" aria-label="Preflight results">
            {PREFLIGHT_STEPS.map(([key, label]) => <div className="triposr-check-row" key={key}>
              <span className={`triposr-check-icon is-${preflight.checks[key]}`} aria-hidden="true">{preflight.checks[key] === 'passed' ? '✓' : preflight.checks[key] === 'failed' ? '!' : '·'}</span>
              <span>{label}</span><span className="triposr-check-state">{preflight.checks[key] === 'passed' ? 'Ready' : preflight.checks[key] === 'failed' ? 'Not ready' : preflight.checks[key] === 'not-run' ? 'Not checked' : 'Checking'}</span>
            </div>)}
          </div>}
        </div>

        <div className="triposr-step-label triposr-reconstruct-label"><span>03</span><strong>Reconstruct</strong></div>
        <button className="reconstruction-submit" type="button" disabled={!canReconstruct} onClick={() => { void reconstruct() }}>
          {activity === 'inference' ? 'Creating your 3D model…' : activity === 'saving' ? 'Saving model…' : 'Generate 3D model'}
        </button>
        <p className="triposr-action-note">A new authenticated reconstruction is created from the selected photo.</p>
      </section>

      <section className="reconstruction-output-card triposr-result-panel" aria-labelledby="triposr-result-title">
        <div className="triposr-panel-heading"><div><p className="calibrated-eyebrow">04 · INSPECT</p><h2 id="triposr-result-title">3D reconstruction</h2></div>
          {prediction && <span className="triposr-result-ready">MODEL READY</span>}</div>
        <div className="triposr-tabs" role="tablist" aria-label="Workspace view">
          <button type="button" role="tab" aria-selected={activeTab === 'result'} className={activeTab === 'result' ? 'is-active' : ''} onClick={() => setActiveTab('result')}>Result</button>
          <button type="button" role="tab" aria-selected={activeTab === 'input'} className={activeTab === 'input' ? 'is-active' : ''} onClick={() => setActiveTab('input')} disabled={!selected}>Input</button>
        </div>

        {activeTab === 'input' && selected ? <div className="triposr-input-tab"><img src={previewUrl} alt="Selected product input" /><div><strong>{selected.file.name}</strong><span>{selected.width} × {selected.height} px</span></div></div> : prediction ? <>
          <TriposrMeshViewer prediction={prediction} />
          <div className="triposr-mesh-meta"><span>{prediction.vertices_count.toLocaleString()} vertices</span><i aria-hidden="true" /><span>{prediction.faces_count.toLocaleString()} faces</span><i aria-hidden="true" /><span>{Math.round(prediction.latency_ms).toLocaleString()} ms</span></div>
          <div className="triposr-result-actions">
            <button type="button" className="triposr-secondary-button" onClick={() => { void download('obj') }}>Download OBJ</button>
            <button type="button" className="triposr-secondary-button" onClick={() => { void download('glb') }}>Download GLB</button>
            <button type="button" className="reconstruction-submit triposr-save-button" disabled={busy} onClick={() => { void saveHistory() }}>Save to history</button>
          </div>
          {saveMessage && <p className="triposr-save-message" role="status">{saveMessage}</p>}
        </> : <div className={`reconstruction-output-empty ${busy ? 'is-processing' : ''}`}>
          {activity === 'inference' ? <div className="triposr-processing-mark" aria-hidden="true"><span /><span /><span /></div> : <div className="reconstruction-output-mark" aria-hidden="true"><span /><span /><span /></div>}
          <strong>{activity === 'inference' ? 'Preparing your 3D model' : 'Your result appears here'}</strong>
          <p>{activity === 'inference' ? 'The image is being processed and its geometry is generated.' : 'Add a photo, run preflight, and generate a new reconstruction to inspect it here.'}</p>
          {!prediction && <Link className="reconstruction-history-link" to="/history">View saved models <Arrow diagonal /></Link>}
        </div>}
        {prediction && <p className="triposr-result-note">Single-image estimates may not show surfaces hidden from the camera.</p>}
      </section>
    </div>
  </main>
}
