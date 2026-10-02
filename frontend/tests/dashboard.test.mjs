import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardProfile } from '../src/dashboard/profile.js'

test('dashboard uses display metadata and falls back to the email label', () => {
  assert.equal(dashboardProfile({ email: 'someone@example.com', user_metadata: { display_name: '  Ada Lovelace  ', full_name: 'Other' } }).name, 'Ada Lovelace')
  assert.equal(dashboardProfile({ user_metadata: { full_name: 'Grace Hopper' } }).initials, 'GH')
  assert.equal(dashboardProfile({ email: 'first.last@example.com', user_metadata: { display_name: 123 } }).name, 'first last')
  assert.equal(dashboardProfile(null).name, '')
})

test('avatar supports HTTPS metadata and rejects unsafe or malformed URLs', () => {
  assert.equal(dashboardProfile({ user_metadata: { picture: 'https://example.com/avatar.png' } }).avatar, 'https://example.com/avatar.png')
  for (const avatar_url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'not-a-url', 'http://example.com/a.png']) {
    assert.equal(dashboardProfile({ user_metadata: { avatar_url } }).avatar, '')
  }
})
