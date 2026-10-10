// The production landing retains its CSS glass surface until GPU initialization
// no longer adds a significant first-interaction/main-thread cost.
export const LANDING_GPU_GLASS_ENABLED = false

export function shouldEnableLandingGlass({ isLanding, reducedMotion, smallScreen = false }) {
  return Boolean(LANDING_GPU_GLASS_ENABLED && isLanding && !reducedMotion && !smallScreen)
}

export function landingGlassTint(theme) {
  return theme === 'ivory'
    ? 'rgba(245, 243, 232, 0.24)'
    : 'rgba(183, 201, 170, 0.22)'
}

export function buildLandingGlassOptions(theme) {
  return {
    engine: 'auto',
    target: '[data-landing-liquid-surface]',
    snapshot: 'body',
    content: false,
    resolution: 0.85,
    refraction: 0.075,
    bevelDepth: 0.2,
    bevelWidth: 0.22,
    frost: 0,
    shadow: true,
    specular: false,
    reveal: 'none',
    tilt: false,
    interaction: 'none',
    tint: landingGlassTint(theme),
    on: { init() {} },
  }
}

export function destroyLandingGlass(instances) {
  const list = Array.isArray(instances) ? instances : [instances]
  for (const instance of list) {
    try { instance?.destroy?.() } catch { /* Cleanup must not interrupt React unmount. */ }
  }
}
