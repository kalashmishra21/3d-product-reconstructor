import { stages } from './modelFacts.js'

export function StageSelector({ selected, onSelect }) {
  return <div className="model-stage-selector" role="group" aria-label="Explore mesh stages">{stages.map((stage, index) =>
    <button key={stage.number} type="button" aria-label={`Explore Stage ${stage.number}`} aria-pressed={selected === index} onClick={() => onSelect(index)}>
      <span>STAGE {stage.number}</span><strong>{stage.vertices.toLocaleString()}</strong><small>vertices</small>
    </button>)}</div>
}
