import { useEffect, useState } from 'react'
import { useTheme } from '../theme/ThemeProvider.jsx'
import { landingGlassState, landingGlassTint } from './landingGlass.js'

function readReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readSmallScreen() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

export function LandingLiquidGlass({ active = true }) {
  const { theme } = useTheme()
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion)
  const [smallScreen, setSmallScreen] = useState(readSmallScreen)

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const viewportQuery = window.matchMedia('(max-width: 767px)')
    const updateMotion = () => setReducedMotion(motionQuery.matches)
    const updateViewport = () => setSmallScreen(viewportQuery.matches)
    motionQuery.addEventListener?.('change', updateMotion)
    viewportQuery.addEventListener?.('change', updateViewport)
    return () => {
      motionQuery.removeEventListener?.('change', updateMotion)
      viewportQuery.removeEventListener?.('change', updateViewport)
    }
  }, [])

  useEffect(() => {
    const surface = document.querySelector('[data-landing-liquid-surface]')
    if (!surface) return
    surface.dataset.liquidState = landingGlassState({ active, reducedMotion, smallScreen })
    surface.dataset.liquidBackend = 'css'
    surface.style.backgroundColor = landingGlassTint(theme)
    surface.style.backdropFilter = active ? 'blur(14px) saturate(1.16)' : ''
    surface.style.webkitBackdropFilter = active ? 'blur(14px) saturate(1.16)' : ''
  }, [active, reducedMotion, smallScreen, theme])

  return null
}
