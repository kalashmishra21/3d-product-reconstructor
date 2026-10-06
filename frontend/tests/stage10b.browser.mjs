// Consolidated deterministic Stage 10B browser gate. Uses test-only fixture tabs on CDP 9224.
// The separate normal visible Chrome run verifies real Auth, FastAPI, checkpoint and hosted Storage.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

for (const [file, marker] of [
  ['dashboard.browser.mjs', 'PASS responsive 320px'],
  ['reconstruction.browser.mjs', 'PASS preflight UI'],
  ['workspace.browser.mjs', 'PASS all protected routes redirect'],
]) {
  const output = execFileSync(process.execPath, [`tests/${file}`], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 180_000 })
  assert.ok(output.includes(marker), `${file} did not finish its expected scenarios`)
  console.log(`PASS ${file}: ${marker}`)
}
