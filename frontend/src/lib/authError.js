const emailLimitMessage = 'Too many email requests were sent recently. Please wait a little before trying another email action.'

export function authErrorMessage(error, action) {
  const code = String(error?.code ?? '').toLowerCase()
  const message = String(error?.message ?? '')
  const emailAction = action === 'signup' || action === 'forgot'

  if (emailAction && (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message))) {
    return emailLimitMessage
  }

  return message || 'The request could not be completed. Please try again.'
}
