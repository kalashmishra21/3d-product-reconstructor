import test from 'node:test'
import assert from 'node:assert/strict'
import { stages, metrics, pipeline, trainedCategories } from '../src/model/modelFacts.js'
import { readFileSync } from 'node:fs'

test('static Model page exposes only verified Pixel2Mesh stage counts', () => {
  assert.deepEqual(stages.map(({ vertices, faces }) => [vertices, faces]), [[156,308],[618,1232],[2466,4928]])
  assert.ok(stages.every((stage) => Object.isFrozen(stage)))
  assert.deepEqual(pipeline, ['RGB image','VGG16','Image features','Graph deformation','Stage 01','Stage 02','Stage 03'])
})

test('test-set metrics are values, not upload-specific accuracy claims', () => {
  assert.deepEqual(metrics.map(({ label, value }) => [label, value]), [['Chamfer Distance','0.037181'],['F1 @ τ','0.000640'],['F1 @ 2τ','0.001722']])
  assert.ok(metrics.every(({ description }) => description && !/accuracy|uploaded image/i.test(description)))
})

test('all configured ShapeNet categories have exact, unique verified labels', () => {
  const source = readFileSync(new URL('../../dataset_tools/prepare_pixel2mesh_subset.py', import.meta.url), 'utf8')
  const configured = source.match(/CATEGORIES = \[([\s\S]*?)\]/)?.[1].match(/"\d{8}"/g)?.map((id) => id.slice(1, -1))
  assert.equal(trainedCategories.length, 13)
  assert.deepEqual(trainedCategories.map(({ id }) => id), configured)
  assert.equal(new Set(trainedCategories.map(({ label }) => label)).size, 13)
  assert.deepEqual(trainedCategories.map(({ label }) => label), [
    'Airplane', 'Bench', 'Cabinet', 'Car', 'Chair', 'Display', 'Lamp',
    'Loudspeaker', 'Rifle', 'Sofa', 'Table', 'Telephone', 'Watercraft',
  ])
})
