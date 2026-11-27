import test from 'node:test'
import assert from 'node:assert/strict'
import { metrics, pipeline, researchStatus, stages, trainedCategories } from '../src/model/modelFacts.js'
import { readFileSync } from 'node:fs'

test('Model Explorer restores the Pixel2Mesh research architecture visualization', () => {
  assert.deepEqual(pipeline, [
    'RGB image', 'VGG16 image features', 'Graph feature fusion',
    'Coarse mesh deformation', 'Mesh upsampling', 'Fine mesh deformation',
  ])
  assert.deepEqual(stages.map(({ vertices, faces }) => [vertices, faces]), [
    [156, 308], [618, 1232], [2466, 4928],
  ])
  assert.equal(trainedCategories.length, 13)
  assert.match(researchStatus, /not the active inference engine/i)
})

test('historical metrics are identified as research results, not live inference scores', () => {
  assert.deepEqual(metrics.map(({ value }) => value), ['0.037181', '0.000640', '0.001722'])
  const source = readFileSync(new URL('../src/pages/Model.jsx', import.meta.url), 'utf8')
  assert.match(source, /RESEARCH ARCHITECTURE/)
  assert.match(source, /RESEARCH VISUALIZATION.*NOT LIVE PREDICTED GEOMETRY/)
  assert.match(source, /HISTORICAL RESEARCH RESULTS/)
  assert.match(source, /Reconstruction is unavailable/)
  assert.doesNotMatch(source, /Current Trained Architecture|Macro F1|Macro Chamfer/)
  assert.match(source, /They are not current service metrics/)
})
