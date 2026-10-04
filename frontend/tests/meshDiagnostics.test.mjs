import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { diagnoseMesh } from '../src/reconstruction/meshDiagnostics.js'
import { healthyStage3 } from './fixtures/healthyStage3.mjs'

test('test mesh has valid Stage-3 topology and is not classified as collapsed', () => {
  const mesh = healthyStage3()
  assert.equal(mesh.vertices.length, 2466)
  assert.equal(mesh.faces.length, 4928)
  assert.ok(mesh.faces.every(f => f.length === 3 && f.every(i => Number.isInteger(i) && i >= 0 && i < 2466)))
  assert.equal(diagnoseMesh(mesh.vertices).degenerate, false)
})

test('near-line diagnostic is scale/rotation independent and never changes coordinates', () => {
  const source = healthyStage3().vertices.map(([x,y,z]) => [x, y * 0.02, z * 0.0005])
  const original = structuredClone(source)
  assert.equal(diagnoseMesh(source).degenerate, true)
  for (const scale of [0.001, 1000]) {
    const rotated = source.map(([x,y,z]) => [scale * (x + y) / Math.SQRT2 + 5, scale * (y - x) / Math.SQRT2 - 3, scale * z + 9])
    assert.equal(diagnoseMesh(rotated).degenerate, true)
  }
  assert.deepEqual(source, original)
})

test('a legitimate thin plate does not trigger the near-line warning', () => {
  const plate = healthyStage3().vertices.map(([x,y,z]) => [x,y,z * 0.00001])
  assert.equal(diagnoseMesh(plate).degenerate, false)
  assert.equal(diagnoseMesh(healthyStage3().vertices.map(v => v.map(x => x * 1e-8))).degenerate, false)
})

test('coincident geometry is flagged; insufficient or invalid data is not given a quality verdict', () => {
  assert.equal(diagnoseMesh(Array.from({length: 8}, () => [1,2,3])).degenerate, true)
  for (const vertices of [null, [], [[0,0,0]], [[NaN,0,0],[0,0,0],[0,0,0],[0,0,0]]]) {
    assert.deepEqual(diagnoseMesh(vertices), { degenerate: false, spread: null })
  }
})

test('production source cannot import the test mesh or a fixture fallback', async () => {
  const root = new URL('../src/', import.meta.url)
  const files = await readdir(root, { recursive: true, withFileTypes: true })
  for (const file of files.filter(entry => entry.isFile() && /\.(jsx?|css)$/.test(entry.name))) {
    const source = await readFile(`${file.parentPath}/${file.name}`, 'utf8')
    assert.doesNotMatch(source, /healthyStage3|tests\/fixtures|\.review\//, file.name)
  }
  const inference = await readFile(new URL('../src/lib/inference.js', import.meta.url), 'utf8')
  assert.match(inference, /validateMeshResponse/); assert.match(inference, /vertices: data.vertices/); assert.match(inference, /faces: data.faces/)
})
