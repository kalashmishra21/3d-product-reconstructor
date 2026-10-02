import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAuthForm } from '../src/lib/authValidation.js'

test('login requires a valid email and a password', () => {
  assert.deepEqual(validateAuthForm('login', { email: 'wrong', password: '' }), {
    email: 'Enter a valid email address.',
    password: 'Enter your password.',
  })
  assert.deepEqual(validateAuthForm('login', { email: 'person@example.com', password: 'present' }), {})
})

test('signup validates name, password length, and confirmation', () => {
  const invalid = validateAuthForm('signup', { name: 'A', email: 'person@example.com', password: 'short', confirm: 'different' })
  assert.ok(invalid.name)
  assert.ok(invalid.password)
  assert.ok(invalid.confirm)
  assert.deepEqual(validateAuthForm('signup', {
    name: 'Demo User', email: 'person@example.com', password: 'eightchars', confirm: 'eightchars',
  }), {})
})

test('password recovery checks only the fields each step needs', () => {
  assert.ok(validateAuthForm('forgot', { email: 'wrong' }).email)
  assert.deepEqual(validateAuthForm('forgot', { email: 'person@example.com' }), {})
  assert.deepEqual(validateAuthForm('reset', { password: 'eightchars', confirm: 'eightchars' }), {})
})
