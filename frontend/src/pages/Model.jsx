import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { metrics, trainedCategories } from '../model/modelFacts.js'
import { StageProgression } from '../model/StageSelector.jsx'
import { ModelPipeline } from '../model/ModelPipeline.jsx'
import { MetricExplanation } from '../model/MetricExplanation.jsx'

export default function Model() {
  return <section className="workspace-page" aria-labelledby="model-page-title">
    <div className="workspace-page-heading"><div><p className="dash-kicker">THE GEOMETRY ENGINE</p><h1 id="model-page-title">Pixel2Mesh<span className="text-olive">.</span></h1><p>From one RGB image to three successive mesh deformations.</p></div><span className="workspace-tag">INTEGRATION CHECKPOINT</span></div>
    <div className="model-explorer"><div className="model-explorer-heading"><div><p className="dash-kicker">IMAGE TO GEOMETRY</p><h2>Three steps toward a mesh.</h2></div><span>TECHNICAL PIPELINE / NOT PREDICTED GEOMETRY</span></div>
      <ModelPipeline /><StageProgression />
    </div>
    <section className="model-categories" aria-labelledby="model-categories-title"><div><p className="dash-kicker">TRAINED CATEGORIES</p><h2 id="model-categories-title">The 13 object classes</h2></div><ul>{trainedCategories.map(({ id, label }) => <li key={id}>{label}</li>)}</ul></section>
    <div className="model-details-grid"><section><p className="dash-kicker">MEASURED ON THE TEST SET</p><h2>Evaluation metrics</h2><dl className="model-evaluation">{metrics.map((metric) => <MetricExplanation key={metric.label} metric={metric} />)}</dl><p className="model-context">Aggregate test-set measurements; these do not describe the quality of an individual upload.</p></section><section className="model-limitation"><p className="dash-kicker">CURRENT BASELINE</p><h2>Integration first.<br /><em>Quality under review.</em></h2><p>The current checkpoint is retained for integration testing while reconstruction quality is being re-evaluated.</p><p>Some results have limited geometric depth. The workspace always displays the real model output and preserves it in exported assets.</p><Link className="dash-text-link" to="/reconstruct">Open the workspace <Arrow diagonal /></Link></section></div>
  </section>
}
