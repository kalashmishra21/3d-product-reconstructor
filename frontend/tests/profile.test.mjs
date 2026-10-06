import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardProfile } from '../src/dashboard/profile.js'

test('saved private display name wins over immutable Auth metadata', () => {
  const authUser = { email: 'demo@example.com', user_metadata: { display_name: 'Original name' } }
  const display = dashboardProfile(authUser, { display_name: 'Edited name' })
  assert.equal(display.name, 'Edited name')
  assert.equal(display.label, 'Edited name')
  assert.equal(display.email, 'demo@example.com')
})
