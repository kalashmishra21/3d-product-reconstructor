import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { stages, metrics } from '../model/modelFacts.js'
import { StageSelector } from '../model/StageSelector.jsx'
import { ModelPipeline } from '../model/ModelPipeline.jsx'
import { MetricExplanation } from '../model/MetricExplanation.jsx'

export default function Model() {
  const [selected, setSelected] = useState(2)
  const stage = stages[selected]
  return <section className="workspace-page" aria-labelledby="model-page-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">THE GEOMETRY ENGINE</p><h1 id="model-page-title">Pixel2Mesh<span className="text-olive">.</span></h1><p>From one RGB image to three successive mesh deformations. Explore the verified topology at each stage.</p></div><span className="workspace-tag">INTEGRATION CHECKPOINT</span></div>
    <div className="model-explorer"><div className="model-explorer-heading"><div><p className="dash-kicker">IMAGE TO GEOMETRY</p><h2>Three steps toward a mesh.</h2></div><span>TECHNICAL PIPELINE / NOT PREDICTED GEOMETRY</span></div>
      <ModelPipeline stage={selected} /><StageSelector selected={selected} onSelect={setSelected} />
      <div className="model-selected-stage" role="status" aria-live="polite"><div><p className="dash-kicker">STAGE {stage.number} / {selected === 2 ? 'FINAL' : 'REFINEMENT'}</p><h3>{stage.heading}</h3><p>{stage.description}</p></div><dl><div><dt>VERTICES</dt><dd>{stage.vertices.toLocaleString()}</dd></div><div><dt>FACES</dt><dd>{stage.faces.toLocaleString()}</dd></div></dl></div>
    </div>
    <div className="model-details-grid"><section><p className="dash-kicker">MEASURED ON THE TEST SET</p><h2>Evaluation metrics</h2><dl className="model-evaluation">{metrics.map((metric) => <MetricExplanation key={metric.label} metric={metric} />)}</dl><p className="model-context">Aggregate test-set measurements, not accuracy percentages or quality scores for an uploaded image.</p></section><section className="model-limitation"><p className="dash-kicker">CURRENT BASELINE</p><h2>Integration first.<br /><em>Quality under review.</em></h2><p>The current checkpoint is retained for integration testing while reconstruction quality is being re-evaluated.</p><p>Some results have limited geometric depth. The workspace always displays the real model output and preserves it in exported assets.</p><p className="dash-categories">13 trained object categories</p><Link className="dash-text-link" to="/reconstruct">Open the workspace <Arrow diagonal /></Link></section></div>
  </section>
}
