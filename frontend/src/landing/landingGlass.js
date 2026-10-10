export function landingGlassState({ active, reducedMotion, smallScreen }) {
  if (!active) return 'inactive'
  if (reducedMotion) return 'reduced-motion'
  return smallScreen ? 'mobile-css' : 'performance-fallback'
}

export function landingGlassTint(theme) {
  return theme === 'ivory'
    ? 'rgba(245, 243, 232, 0.24)'
    : 'rgba(183, 201, 170, 0.22)'
}
