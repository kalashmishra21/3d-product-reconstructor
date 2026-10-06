import { pipeline } from './modelFacts.js'

export function ModelPipeline({ stage }) {
  return <ol className="model-pipeline" aria-label="Pixel2Mesh processing pipeline">{pipeline.map((step, index) =>
    <li key={step} className={index === stage + 4 ? 'is-selected' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol>
}
