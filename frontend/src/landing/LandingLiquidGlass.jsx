import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { buildLandingGlassOptions, destroyLandingGlass, landingGlassTint, shouldEnableLandingGlass } from './landingGlass.js'

function readReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readSmallScreen() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

export function LandingLiquidGlass({ active = true }) {
  const { theme } = useTheme()
  const themeRef = useRef(theme)
  const instancesRef = useRef(null)
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion)
  const [smallScreen, setSmallScreen] = useState(readSmallScreen)
  themeRef.current = theme

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const viewportQuery = window.matchMedia('(max-width: 767px)')
    const update = () => setReducedMotion(query.matches)
    const updateViewport = () => setSmallScreen(viewportQuery.matches)
    query.addEventListener?.('change', update)
    viewportQuery.addEventListener?.('change', updateViewport)
    return () => {
      query.removeEventListener?.('change', update)
      viewportQuery.removeEventListener?.('change', updateViewport)
    }
  }, [])

  useEffect(() => {
    const surface = document.querySelector('[data-landing-liquid-surface]')
    if (!surface) return undefined
    let cancelled = false
    let idleHandle
    let timeoutHandle
    let instances

    const showCssSurface = state => {
      surface.dataset.liquidState = state
      surface.dataset.liquidBackend = 'css'
      surface.style.backgroundColor = landingGlassTint(themeRef.current)
      surface.style.backdropFilter = 'blur(14px) saturate(1.16)'
      surface.style.webkitBackdropFilter = 'blur(14px) saturate(1.16)'
    }

    if (!shouldEnableLandingGlass({ isLanding: active, reducedMotion, smallScreen })) {
      if (!active) {
        surface.dataset.liquidState = 'inactive'
        surface.dataset.liquidBackend = 'css'
      } else {
        const state = reducedMotion
          ? 'reduced-motion'
          : smallScreen
            ? 'mobile-css'
            : 'performance-fallback'
        showCssSurface(state)
      }
      return undefined
    }

    const initialize = async () => {
      try {
        const { default: liquidGL } = await import('liquid-gl')
        if (cancelled || !surface.isConnected) return
        instances = liquidGL({
          ...buildLandingGlassOptions(themeRef.current),
          on: {
            init(instance) {
              if (cancelled || !surface.isConnected) return
              const backend = instance.renderer?.backend?.kind
              surface.dataset.liquidBackend = backend || 'css'
              surface.dataset.liquidState = 'ready'
              if (!backend) showCssSurface('ready')
            },
          },
        })
        instancesRef.current = instances
        const lens = Array.isArray(instances) ? instances[0] : instances
        if (!lens?.renderer) showCssSurface('ready')
        else {
          // The GPU surface becomes visible after its first captured frame.
          timeoutHandle = window.setTimeout(() => {
            if (!cancelled && surface.dataset.liquidState !== 'ready') {
              surface.dataset.liquidBackend = lens.renderer?.backend?.kind || 'css'
              surface.dataset.liquidState = 'ready'
            }
          }, 1800)
        }
      } catch {
        if (!cancelled) showCssSurface('ready')
      }
    }

    // Defer the one-off page snapshot until the initial hero work has settled.
    if ('requestIdleCallback' in window) idleHandle = window.requestIdleCallback(initialize, { timeout: 1400 })
    else timeoutHandle = window.setTimeout(initialize, 350)

    return () => {
      cancelled = true
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
      destroyLandingGlass(instances)
      instancesRef.current = null
    }
  }, [active, reducedMotion, smallScreen])

  useEffect(() => {
    const surface = document.querySelector('[data-landing-liquid-surface]')
    if (!surface) return
    const instances = Array.isArray(instancesRef.current) ? instancesRef.current : [instancesRef.current]
    let hasGpuLens = false
    for (const lens of instances) {
      if (lens?.renderer?.backend) hasGpuLens = true
      lens?.setTint?.(landingGlassTint(theme))
    }
    if (!hasGpuLens) surface.style.backgroundColor = landingGlassTint(theme)
  }, [theme])

  return null
}
