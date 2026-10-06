import test from 'node:test'
import assert from 'node:assert/strict'
import { stages, metrics, pipeline } from '../src/model/modelFacts.js'

test('interactive Model Explorer exposes only verified Pixel2Mesh stage counts', () => {
  assert.deepEqual(stages.map(({ vertices, faces }) => [vertices, faces]), [[156,308],[618,1232],[2466,4928]])
  assert.ok(stages.every((stage) => Object.isFrozen(stage)))
  assert.deepEqual(pipeline, ['RGB image','VGG16','Image features','Graph deformation','Stage 01','Stage 02','Stage 03'])
})

test('test-set metrics are values, not upload-specific accuracy claims', () => {
  assert.deepEqual(metrics.map(({ label, value }) => [label, value]), [['Chamfer Distance','0.037181'],['F1 @ τ','0.000640'],['F1 @ 2τ','0.001722']])
  assert.ok(metrics.every(({ description }) => description && !/accuracy|uploaded image/i.test(description)))
})
