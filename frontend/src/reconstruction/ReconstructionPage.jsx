import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow, Mark } from '../components/Icons'
import { BackendStatus } from '../components/BackendStatus'
import { DashboardIcon as Icon } from '../dashboard/DashboardIcon'
import { dashboardProfile } from '../dashboard/profile'
import { useAuth } from '../auth/AuthProvider'
import { useBackendHealth } from '../lib/useBackendHealth'
import { preflightErrorMessage, preflightImage } from '../lib/preflight'
import { formatBytes, inspectImageFile } from './image'
import { InputViewport } from './InputViewport'
import './reconstruction.css'

const steps = ['IMAGE', 'PREFLIGHT', 'MESH', 'EXPORT']

export function ReconstructionPage() {
  const { user } = useAuth()
  const profile = dashboardProfile(user)
  const health = useBackendHealth()
  const input = useRef(null)
  const request = useRef(null)
  const selectionVersion = useRef(0)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [phase, setPhase] = useState('empty')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(null)

  useEffect(() => {
    if (!selection?.file) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(selection.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selection?.file])

  useEffect(() => () => request.current?.abort(), [])

  function reset() {
    selectionVersion.current += 1
    request.current?.abort()
    request.current = null
    if (input.current) input.current.value = ''
    setSelection(null)
    setVerified(null)
    setError('')
    setPhase('empty')
  }

  async function selectFile(file) {
    if (!file) return
    const version = ++selectionVersion.current
    request.current?.abort()
    setSelection(null)
    setVerified(null)
    setError('')
    setPhase('checking')
    try {
      const inspected = await inspectImageFile(file)
      if (version !== selectionVersion.current) return
      setSelection(inspected)
      setPhase('selected')
    } catch (failure) {
      if (version !== selectionVersion.current) return
      setError(failure.message)
      setPhase('error')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 1) {
      setError('Select one image at a time.')
      setPhase('error')
      return
    }
    selectFile(files[0])
  }

  async function runPreflight() {
    if (!selection || phase === 'submitting') return
    const version = selectionVersion.current
    const controller = new AbortController()
    request.current = controller
    setError('')
    setVerified(null)
    setPhase('submitting')
    try {
      const result = await preflightImage(selection.file, { signal: controller.signal })
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setVerified(result)
      setPhase('ready')
    } catch (failure) {
      if (version !== selectionVersion.current || controller.signal.aborted) return
      setError(preflightErrorMessage(failure))
      setPhase('error')
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  return <div className="recon-page">
    <header className="recon-topbar">
      <Link className="recon-brand" to="/" aria-label="Reconstruct home"><Mark />reconstruct<span>.</span></Link>
      <span className="recon-topbar-center">IMAGE / STRUCTURE / FORM <span>—</span> WORKSPACE 01</span>
      <div className="recon-topbar-end"><BackendStatus health={health} /><Link to="/dashboard" className="recon-back">Back to overview <Arrow /></Link></div>
    </header>

    <main id="main-content" className="recon-main" tabIndex={-1}>
      <div className="recon-heading">
        <div><p className="recon-eyebrow"><span />NEW RECONSTRUCTION / INPUT STUDIO</p><h1>Give an image <em>dimension.</em></h1><p className="recon-intro">Bring one product image into the workspace. Inspect the input, then verify it before reconstruction begins.</p></div>
        <div className="recon-heading-index"><span>01 / 04</span><small>INPUT PREPARATION</small></div>
      </div>

      <div className="recon-workspace">
        <section className="recon-control-panel" aria-labelledby="recon-upload-title">
          <div className="recon-panel-heading"><span className="recon-panel-number">01</span><div><p className="recon-eyebrow">SOURCE IMAGE</p><h2 id="recon-upload-title">Select your view.</h2></div></div>
          <p className="recon-panel-intro">A single clear RGB product image gives the model its starting point. This stage checks the input only.</p>

          <div className={'recon-drop' + (dragging ? ' is-dragging' : '') + (selection ? ' has-image' : '')}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
            onDrop={handleDrop}>
            <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a product image" onChange={(event) => selectFile(event.target.files?.[0])} tabIndex={-1} />
            <div className="recon-drop-symbol" aria-hidden="true"><Icon name="image" /><span>+</span></div>
            <p className="recon-drop-title">{selection ? 'Image in workspace' : 'Place your image here.'}</p>
            <p className="recon-drop-copy">{selection ? 'Replace the image or continue to preflight.' : 'Drag one image into the studio, or browse your device.'}</p>
            <button type="button" className="recon-browse" onClick={() => input.current?.click()}>{selection ? 'Replace image' : 'Choose image'} <Arrow diagonal /></button>
            <span className="recon-drop-limit">JPEG / PNG / WEBP <span>·</span> MAX 10 MB</span>
          </div>

          {phase === 'checking' && <p className="recon-inline-state" role="status">Decoding image and checking dimensions…</p>}
          {error && <p className="recon-inline-error" role="alert">{error}</p>}
          {selection && <div className="recon-selection" aria-label="Selected image metadata">
            <div className="recon-selection-head"><span>LOCAL IMAGE</span><button type="button" onClick={reset}>Clear image</button></div>
            <strong title={selection.file.name}>{selection.file.name}</strong>
            <dl><div><dt>Format</dt><dd>{selection.format}</dd></div><div><dt>Size</dt><dd>{formatBytes(selection.file.size)}</dd></div><div><dt>Resolution</dt><dd>{selection.width} × {selection.height}</dd></div></dl>
          </div>}

          <button className="recon-submit" type="button" onClick={runPreflight} disabled={!selection || phase === 'submitting'}>
            <span>{phase === 'submitting' ? 'VERIFYING INPUT…' : phase === 'ready' ? 'VERIFY AGAIN' : 'RUN PREFLIGHT'}</span><Arrow diagonal />
          </button>
          <p className="recon-submit-note">No mesh is generated at this step. Your image is checked in memory and is not saved.</p>

          {verified && <div className="recon-ready" role="status" aria-live="polite">
            <p><span className="recon-ready-dot" />INPUT VERIFIED</p>
            <strong>Ready for reconstruction.</strong>
            <span>{verified.width} × {verified.height} <i /> {verified.format} <i /> {formatBytes(verified.size_bytes)}</span>
            <small>Mesh generation will be available in a later stage.</small>
          </div>}
        </section>

        <section className="recon-view-panel" aria-labelledby="recon-view-title">
          <div className="recon-view-header"><div><p className="recon-eyebrow">SPATIAL INPUT STAGE / 001</p><h2 id="recon-view-title">Input inspection</h2></div><span className="recon-live-label">{phase === 'ready' ? 'PREFLIGHT READY' : selection ? 'IMAGE LOADED' : 'AWAITING IMAGE'}</span></div>
          <InputViewport previewUrl={previewUrl} width={selection?.width} height={selection?.height} scanning={phase === 'submitting'} />
          <div className="recon-view-foot"><span>{selection ? 'ACTUAL INPUT IMAGE / 2D PLANE' : 'PROCEDURAL SPATIAL GUIDE'}</span><span>{selection ? 'PREVIEW ONLY — NOT A RECONSTRUCTED MESH' : 'ILLUSTRATIVE — NOT MODEL OUTPUT'}</span></div>
        </section>
      </div>

      <nav className="recon-pipeline" aria-label="Reconstruction pipeline">
        <p className="recon-eyebrow">PROCESS / FOUR STAGES</p>
        <ol>{steps.map((step, index) => {
          const complete = index === 0 ? Boolean(selection) : index === 1 ? Boolean(verified) : false
          const current = index === 0 ? !selection : index === 1 && Boolean(selection) && !verified
          return <li key={step} className={complete ? 'is-complete' : current ? 'is-current' : 'is-future'}><span>0{index + 1}</span><strong>{step}</strong><small>{complete ? 'COMPLETE' : current ? 'CURRENT' : 'FUTURE'}</small></li>
        })}</ol>
      </nav>
      <footer className="recon-footer"><span>RECONSTRUCT / IMAGE TO FORM</span><span>Signed in as {profile.label}</span></footer>
    </main>
  </div>
}
