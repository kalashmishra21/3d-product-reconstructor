import { pipeline } from './modelFacts.js'

export function ModelPipeline() {
  return <ol className="model-pipeline" aria-label="Historical Pixel2Mesh research pipeline">{pipeline.map((step, index) =>
    <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol>
}
