import assert from 'node:assert/strict'
import test from 'node:test'
import { authErrorMessage } from '../src/lib/authError.js'

const friendlyLimit = 'Too many email requests were sent recently. Please wait a little before trying another email action.'

test('signup and recovery turn Supabase email limits into actionable feedback', () => {
  assert.equal(authErrorMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'signup'), friendlyLimit)
  assert.equal(authErrorMessage({ message: 'Email rate limit exceeded' }, 'forgot'), friendlyLimit)
})

test('other authentication errors remain available to the user', () => {
  assert.equal(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'login'), 'Invalid login credentials')
  assert.equal(authErrorMessage(null, 'signup'), 'The request could not be completed. Please try again.')
})
