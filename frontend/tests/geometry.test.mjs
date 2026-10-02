import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createChairGeometry, createFaceOffsets } from '../src/three/chairGeometry.js'

test('illustrative geometry contains finite triangles and rigid face-separation offsets', () => {
  const geometry = createChairGeometry()
  const positions = geometry.getAttribute('position')
  const offsets = createFaceOffsets(geometry)
  assert.ok(positions.count > 0 && positions.count % 3 === 0)
  assert.ok(positions.array.every(Number.isFinite))
  assert.ok(offsets.every(Number.isFinite))
  assert.equal(offsets.length, positions.array.length)
  for (let i = 0; i < offsets.length; i += 9) {
    assert.deepEqual(offsets.slice(i, i + 3), offsets.slice(i + 3, i + 6))
    assert.deepEqual(offsets.slice(i, i + 3), offsets.slice(i + 6, i + 9))
  }
  geometry.dispose()
})
