import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('Dashboard browser gate honors the requested CDP port', () => {
  const run = spawnSync(process.execPath, ['tests/dashboard.browser.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CDP_PORT: '65534' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.notEqual(run.status, 0, 'an unavailable selected port must stop the browser gate')
  assert.match(run.stderr, /ECONNREFUSED 127\.0\.0\.1:65534\b/, 'the gate must connect to the selected port')
})
