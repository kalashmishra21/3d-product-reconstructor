import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { DashboardIcon as Icon } from '../dashboard/DashboardIcon'
import { useReconstructionJob } from '../jobs/ReconstructionJobProvider.jsx'
import { formatBytes } from './image'
import { InputViewport } from './InputViewport'
import { ResultViewport } from './ResultViewport'
import { SourceView } from './SourceView'
import { ExportPanel } from './ExportPanel'
import { formatMilliseconds, validateMeshResponse } from './mesh'
import './reconstruction.css'

const steps = ['IMAGE', 'PREFLIGHT', 'MESH', 'EXPORT']

export function ReconstructionPage() {
  const job = useReconstructionJob()
  const { selection, objectName, verified, mesh, phase } = job.state
  const { previewUrl } = job
  const input = useRef(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState('')
  const [nameSaveStatus, setNameSaveStatus] = useState('')
  const [resultView, setResultView] = useState('mesh')
  const busy = phase === 'processing' || phase === 'persisting'
  const inferencePhase = busy ? 'running' : mesh ? 'complete' : job.state.failureKind === 'inference' ? 'error' : 'idle'
  const error = dropError || (['selection', 'preflight'].includes(job.state.failureKind) ? job.state.error : '')
  const inferenceError = ['inference', 'database', 'persistence'].includes(job.state.failureKind) ? job.state.error : ''
  const exportAvailable = useMemo(() => Boolean(mesh) && !validateMeshResponse(mesh), [mesh])
  const diagnostic = job.state.diagnostic

  function switchView(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const view = resultView === 'mesh' ? 'input' : 'mesh'
      setResultView(view)
      event.currentTarget.parentElement.querySelector(`[data-view="${view}"]`)?.focus()
    }
  }

  function reset() {
    if (!job.reset()) return
    if (input.current) input.current.value = ''
    setResultView('mesh')
    setDropError('')
  }

  async function selectFile(file) {
    if (!file) return
    setDropError('')
    setNameSaveStatus('')
    setResultView('mesh')
    await job.selectFile(file)
    if (input.current) input.current.value = ''
  }
  async function saveName() {
    setNameSaveStatus('Saving name…')
    try {
      await job.saveObjectName()
      setNameSaveStatus('Name saved')
    } catch {
      setNameSaveStatus('Could not save name. Try again.')
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 1) {
      setDropError('Select one image at a time.')
      return
    }
    selectFile(files[0])
  }

  return <div className={'recon-page' + (mesh ? ' has-result' : '')}>
    <div className="recon-main">
      <div className="recon-heading">
        <div><p className="recon-eyebrow"><span />RECONSTRUCTION STUDIO</p><h1>Give an image <em>dimension.</em></h1><p className="recon-intro">Prepare a view. Inspect the model geometry. Export an asset.</p></div>
        <Link className="workspace-link" to="/model">Model baseline <Arrow diagonal /></Link>
      </div>

      <div className="recon-workspace">
        <section className={'recon-control-panel' + (mesh ? ' has-result' : '')} aria-labelledby="recon-upload-title">
          <div className="recon-panel-heading"><span className="recon-panel-number">01</span><div><p className="recon-eyebrow">SOURCE IMAGE</p><h2 id="recon-upload-title">Select your view.</h2></div></div>
          {!mesh && <><p className="recon-panel-intro">A single clear RGB product image gives the model its starting point. This stage checks the input only.</p>
          <p className="recon-domain-note">Best results come from object categories and views similar to the model's ShapeNet training data.</p></>}

          <div className={'recon-drop' + (dragging ? ' is-dragging' : '') + (selection ? ' has-image' : '')}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}
            onDrop={handleDrop}>
            <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a product image" onChange={(event) => selectFile(event.target.files?.[0])} tabIndex={-1} />
            <div className="recon-drop-symbol" aria-hidden="true"><Icon name="image" /><span>+</span></div>
            <p className="recon-drop-title">{selection ? 'Image in workspace' : 'Place your image here.'}</p>
            <p className="recon-drop-copy">{selection ? 'Replace the image or continue to preflight.' : 'Drag one image into the studio, or browse your device.'}</p>
            <button type="button" className="recon-browse" onClick={() => input.current?.click()} disabled={busy}>{selection ? 'Replace image' : 'Choose image'} <Arrow diagonal /></button>
            <span className="recon-drop-limit">JPEG / PNG / WEBP <span>·</span> MAX 10 MB</span>
          </div>

          {phase === 'selected' && !selection && <p className="recon-inline-state" role="status">Decoding image and checking dimensions…</p>}
          {error && <p className="recon-inline-error" role="alert">{error}</p>}
          {selection && <div className="recon-selection" aria-label="Selected image metadata">
            <div className="recon-selection-head"><span>LOCAL IMAGE</span><button type="button" onClick={reset} disabled={busy}>Clear image</button></div>
            <label className="recon-object-field">OBJECT NAME<input type="text" value={objectName} onChange={(event) => { setNameSaveStatus(''); job.setObjectName(event.target.value) }} placeholder="Name this object" maxLength={80} disabled={busy} /></label>
            {mesh && job.state.id && <div className="recon-name-save"><button type="button" className="recon-save-name" onClick={saveName}>Save name</button><span role="status">{nameSaveStatus}</span></div>}
            <span className="recon-source-label">SOURCE FILE</span>
            <strong title={selection.file.name}>{selection.file.name}</strong>
            <dl><div><dt>Format</dt><dd>{selection.format}</dd></div><div><dt>Size</dt><dd>{formatBytes(selection.file.size)}</dd></div><div><dt>Resolution</dt><dd>{selection.width} × {selection.height}</dd></div></dl>
          </div>}

          {!mesh && <><button className="recon-submit" type="button" onClick={job.runPreflight} disabled={!selection || phase === 'preflighting' || busy}>
            <span>{phase === 'preflighting' ? 'VERIFYING INPUT…' : phase === 'ready' ? 'VERIFY AGAIN' : 'RUN PREFLIGHT'}</span><Arrow diagonal />
          </button>
          <p className="recon-submit-note">Preflight checks the image only. The model runs when you choose Reconstruct Mesh.</p></>}

          {verified && !mesh && <div className="recon-ready" role="status" aria-live="polite">
            <p><span className="recon-ready-dot" />INPUT VERIFIED</p>
            <strong>{objectName || 'Ready for reconstruction.'}</strong>
            <span>{verified.width} × {verified.height} <i /> {verified.format} <i /> {formatBytes(verified.size_bytes)}</span>
            <small>Preflight passed. Run the trained model to produce a final Stage-3 mesh.</small>
          </div>}

          {verified && mesh && <div className="recon-ready recon-ready-compact" role="status"><p><span className="recon-ready-dot" />PREFLIGHT VERIFIED</p><span>{verified.width} × {verified.height} <i /> {verified.format}</span></div>}
          {verified && <button className="recon-infer" type="button" onClick={job.startReconstruction} disabled={busy || job.state.failureKind === 'persistence'}>
            <span>{inferencePhase === 'running' ? 'MODEL INFERENCE IN PROGRESS...' : mesh ? 'RECONSTRUCT AGAIN' : 'RECONSTRUCT MESH'}</span><Arrow diagonal />
          </button>}
          {inferencePhase === 'running' && <p className="recon-infer-note" role="status">{phase === 'persisting' ? 'Saving the real Stage-3 mesh and export files.' : 'Running the trained Pixel2Mesh model. The input preview remains visible; this is not a live mesh preview.'}</p>}
          {inferenceError && <p className="recon-inline-error" role="alert">{inferenceError}</p>}
          {mesh && <div className="recon-mesh-result" role="status" aria-live="polite">
            <p className="recon-eyebrow">MESH GENERATED / REAL MODEL OUTPUT</p>
            <strong>{objectName || 'Untitled object'} <span>— Stage 03 generated</span></strong>
            <dl><div><dt>Model</dt><dd>{mesh.model}</dd></div><div><dt>Vertices</dt><dd>{mesh.vertices_count.toLocaleString()}</dd></div><div><dt>Faces</dt><dd>{mesh.faces_count.toLocaleString()}</dd></div><div><dt>Inference</dt><dd>{mesh.latency_ms.toLocaleString()} ms</dd></div></dl>
            <div className="recon-timing"><span>Model load <b>{mesh.model_init_ms > 0 ? formatMilliseconds(mesh.model_init_ms) : 'READY / REUSED'}</b></span><span>Total request <b>{formatMilliseconds(mesh.total_ms)}</b></span></div>
            <small>Real model coordinates. Display fitting does not change exported geometry.</small>
          </div>}
          {job.state.failureKind === 'persistence' && <button type="button" className="recon-infer" onClick={job.retryPersistence}>RETRY SAVE <Arrow diagonal /></button>}
        </section>

        <section className={'recon-view-panel' + (mesh && resultView === 'mesh' ? ' is-result' : '')} aria-labelledby="recon-view-title">
          <div className="recon-view-header"><div><p className="recon-eyebrow">{mesh && resultView === 'mesh' ? 'REAL MODEL OUTPUT / 003' : 'SOURCE IMAGE / 001'}</p><h2 id="recon-view-title">{mesh && resultView === 'mesh' ? 'Real Stage-3 mesh' : 'Input inspection'}</h2></div><div className="recon-view-header-end"><span className="recon-live-label">{inferencePhase === 'running' ? 'MODEL INFERENCE' : mesh && resultView === 'mesh' ? 'MESH GENERATED' : phase === 'ready' ? 'PREFLIGHT READY' : selection ? 'IMAGE LOADED' : 'AWAITING IMAGE'}</span></div></div>
          {mesh && <div className="result-view-tabs" role="tablist" aria-label="Inspect reconstruction or source">
            <button type="button" role="tab" data-view="mesh" aria-selected={resultView === 'mesh'} tabIndex={resultView === 'mesh' ? 0 : -1} onClick={() => setResultView('mesh')} onKeyDown={(event) => switchView(event)}>RESULT</button>
            <button type="button" role="tab" data-view="input" aria-selected={resultView === 'input'} tabIndex={resultView === 'input' ? 0 : -1} onClick={() => setResultView('input')} onKeyDown={(event) => switchView(event)}>INPUT</button>
          </div>}
          {mesh && resultView === 'mesh' && diagnostic?.degenerate && <div className="recon-volume-note" role="status"><strong>Low-volume reconstruction</strong><p>The current model produced limited geometric depth for this image.</p><span>Inspection and raw OBJ / GLB export remain available.</span></div>}
          {mesh && resultView === 'mesh' ? <ResultViewport mesh={mesh} objectName={objectName} /> : selection && previewUrl ? <SourceView src={previewUrl} filename={selection.file.name} width={selection.width} height={selection.height} /> : <InputViewport previewUrl={previewUrl} width={selection?.width} height={selection?.height} scanning={phase === 'preflighting' || inferencePhase === 'running'} />}
          <div className="recon-view-foot"><span>{mesh && resultView === 'mesh' ? 'ACTUAL STAGE-3 GEOMETRY' : selection ? 'ACTUAL SOURCE IMAGE / 2D' : 'PROCEDURAL SPATIAL GUIDE'}</span><span>{mesh && resultView === 'mesh' ? `${mesh.vertices_count.toLocaleString()} VERTICES / ${mesh.faces_count.toLocaleString()} FACES` : selection ? 'INPUT PREVIEW ONLY' : 'ILLUSTRATIVE — NOT MODEL OUTPUT'}</span></div>
          {mesh && <ExportPanel mesh={mesh} objectName={objectName} sourceFilename={selection?.file.name} />}
        </section>
      </div>

      <nav className={'recon-pipeline' + (mesh ? ' is-complete' : '')} aria-label="Reconstruction pipeline">
        <p className="recon-eyebrow">PROCESS / FOUR STAGES</p>
        <ol>{steps.map((step, index) => {
          const complete = index === 0 ? Boolean(selection) : index === 1 ? Boolean(verified) : index === 2 ? Boolean(mesh) : exportAvailable
          const current = index === 0 ? !selection : index === 1 ? Boolean(selection) && !verified : index === 2 && Boolean(verified) && !mesh
          return <li key={step} className={complete ? 'is-complete' : current ? 'is-current' : 'is-future'}><span>0{index + 1}</span><strong>{step}</strong><small>{index === 3 && complete ? 'AVAILABLE' : complete ? 'COMPLETE' : current ? 'CURRENT' : 'FUTURE'}</small></li>
        })}</ol>
      </nav>
    </div>
  </div>
}
