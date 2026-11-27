import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { getTriposrReadiness } from '../lib/triposr.js'
import { metrics, researchStatus, trainedCategories } from '../model/modelFacts.js'
import { StageProgression } from '../model/StageSelector.jsx'
import { ModelPipeline } from '../model/ModelPipeline.jsx'
import { MetricExplanation } from '../model/MetricExplanation.jsx'

export default function Model() {
  const [serviceState, setServiceState] = useState('checking')
  const refreshServiceState = useCallback(async () => {
    setServiceState('checking')
    const result = await getTriposrReadiness()
    setServiceState(result.ready ? 'ready' : 'unavailable')
  }, [])

  useEffect(() => { void refreshServiceState() }, [refreshServiceState])

  return <section className="workspace-page" aria-labelledby="model-page-title">
    <div className="workspace-page-heading">
      <div>
        <p className="dash-kicker">MODEL EXPLORER</p>
        <h1 id="model-page-title">Pixel2Mesh<span className="text-olive">.</span></h1>
        <p>The original Pixel2Mesh graph-deformation architecture, preserved as research history.</p>
      </div>
      <span className="workspace-tag">RESEARCH ARCHITECTURE</span>
    </div>

    <div className="model-explorer">
      <div className="model-explorer-heading">
        <div><p className="dash-kicker">IMAGE TO GEOMETRY</p><h2>Three stages of graph deformation.</h2></div>
        <span>RESEARCH VISUALIZATION · NOT LIVE PREDICTED GEOMETRY</span>
      </div>
      <StageProgression />
      <ModelPipeline />
      <p className="model-context">{researchStatus}</p>
    </div>

    <section className="model-categories" aria-labelledby="research-categories-title">
      <div><p className="dash-kicker">ORIGINAL RESEARCH DATASET</p><h2 id="research-categories-title">ShapeNet category coverage</h2></div>
      <ul>{trainedCategories.map(({ id, label }) => <li key={id}>{label}</li>)}</ul>
      <p className="model-context">These historical research categories are not a statement of current live-service support.</p>
    </section>

    <div className="model-details-grid">
      <section aria-labelledby="historical-metrics-title">
        <p className="dash-kicker">HISTORICAL RESEARCH RESULTS</p>
        <h2 id="historical-metrics-title">Pixel2Mesh benchmark snapshot</h2>
        <dl className="model-evaluation">{metrics.map((metric) => <MetricExplanation key={metric.label} metric={metric} />)}</dl>
        <p className="model-context">These are historical Pixel2Mesh measurements. They are not current service metrics or predictions for an uploaded image.</p>
      </section>
      <section className="model-limitation" aria-labelledby="service-status-title">
        <p className="dash-kicker">LIVE SERVICE</p>
        <h2 id="service-status-title">{serviceState === 'ready' ? 'TripoSR inference is ready' : serviceState === 'checking' ? 'Checking TripoSR readiness' : 'TripoSR inference is unavailable'}</h2>
        <p role="status">{serviceState === 'ready'
          ? 'The authenticated image endpoint is ready to generate a new prediction from one RGB image.'
          : serviceState === 'checking'
            ? 'Checking whether the authenticated TripoSR worker is available.'
            : 'The authenticated TripoSR worker is not ready. The upload page will not substitute saved-gallery or ground-truth geometry.'}</p>
        {serviceState !== 'ready' && <button type="button" className="dash-text-link" onClick={() => { void refreshServiceState() }} disabled={serviceState === 'checking'}>Check service again</button>}
        <Link className="dash-text-link" to="/reconstruct">Open image reconstruction <Arrow diagonal /></Link>
      </section>
    </div>
  </section>
}
