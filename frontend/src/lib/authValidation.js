const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAuthForm(mode, values) {
  const errors = {}
  if (mode === 'signup') {
    if (values.name.trim().length < 2 || values.name.trim().length > 60) {
      errors.name = 'Enter a name between 2 and 60 characters.'
    }
  }
  if (mode !== 'reset' && !emailPattern.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (mode !== 'forgot') {
    if (!values.password) errors.password = 'Enter your password.'
    else if (mode !== 'login' && values.password.length < 8) errors.password = 'Use at least 8 characters.'
  }
  if (mode === 'signup' || mode === 'reset') {
    if (values.confirm !== values.password) errors.confirm = 'Passwords do not match.'
  }
  return errors
}
