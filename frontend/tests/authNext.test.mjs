import test from 'node:test'
import assert from 'node:assert/strict'
import { safeWorkspaceNext } from '../src/auth/safeWorkspaceNext.js'

test('expired sessions retain only safe internal workspace destinations', () => {
  for (const path of ['/dashboard', '/reconstruct', '/history', '/model',
    '/reconstructions/22222222-2222-4222-8222-222222222222']) {
    assert.equal(safeWorkspaceNext(path), path)
  }
  for (const path of [null, '', '//evil.example', 'https://evil.example', '/auth/callback',
    '/profile', '/reconstructions/not-a-uuid', '/history?redirect=https://evil.example']) {
    assert.equal(safeWorkspaceNext(path), '/dashboard')
  }
})
