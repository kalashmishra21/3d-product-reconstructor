import { useCallback, useEffect, useState } from 'react'
import { getHealth } from './api.js'

export function useBackendHealth() {
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let disposed = false
    let pending
    let timeout

    async function check() {
      pending?.abort()
      clearTimeout(timeout)
      const controller = new AbortController()
      pending = controller
      setState('loading')
      timeout = setTimeout(() => controller.abort(), 5000)
      try {
        await getHealth(controller.signal)
        if (!disposed && pending === controller) setState('connected')
      } catch {
        if (!disposed && pending === controller) setState('unavailable')
      } finally {
        if (pending === controller) clearTimeout(timeout)
      }
    }

    void check()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, 30_000)
    return () => {
      disposed = true
      clearInterval(interval)
      clearTimeout(timeout)
      pending?.abort()
    }
  }, [attempt])

  return { state, retry }
}
