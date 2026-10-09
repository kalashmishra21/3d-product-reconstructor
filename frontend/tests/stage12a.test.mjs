import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveTheme, rememberTheme, createStudyGeometry } from '../src/stage12a/study.js'

test('prototype theme handles stored choices, system preference, and blocked storage', () => {
  assert.equal(resolveTheme('ivory', true), 'ivory')
  assert.equal(resolveTheme('forest', false), 'forest')
  assert.equal(resolveTheme('invalid', false), 'ivory')
  assert.equal(resolveTheme(null, true), 'forest')
  assert.doesNotThrow(() => rememberTheme('forest', { setItem() { throw new Error('Blocked') } }))
  const writes = []
  rememberTheme('ivory', { setItem: (...args) => writes.push(args) })
  assert.deepEqual(writes, [['reconstruct.prototype.theme', 'ivory']])
})

test('illustrative vessel has finite geometry, valid triangles, and no inference dependency', async () => {
  const { positions, indices } = createStudyGeometry()
  assert.ok(positions.length > 1000)
  assert.ok(positions.every(Number.isFinite))
  assert.equal(indices.length % 3, 0)
  assert.ok(indices.every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3))
  const source = await readFile(new URL('../src/stage12a/study.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\(|\/infer|supabase/)
})
