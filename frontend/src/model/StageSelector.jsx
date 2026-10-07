import { stages } from './modelFacts.js'

export function StageProgression() {
  return <div className="model-stage-grid" aria-label="Verified mesh stages">{stages.map((stage) =>
    <section className="model-stage" key={stage.number} aria-label={`Stage ${stage.number}`}>
      <p className="model-stage-top"><span>{stage.number}</span><span>STAGE {stage.number}</span></p>
      <h3>{stage.heading}</h3><p>{stage.description}</p>
      <dl><div><dt>Vertices</dt><dd>{stage.vertices.toLocaleString()}</dd></div><div><dt>Faces</dt><dd>{stage.faces.toLocaleString()}</dd></div></dl>
    </section>)}</div>
}
