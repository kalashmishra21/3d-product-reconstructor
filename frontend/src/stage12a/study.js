export function resolveTheme(saved, prefersDark) {
  return ['forest', 'ivory'].includes(saved) ? saved : prefersDark ? 'forest' : 'ivory'
}

export function rememberTheme(theme, storage) {
  try { storage.setItem('reconstruct.prototype.theme', theme) } catch { /* Private browsing may block storage. */ }
}

// Procedural vessel for the design proof only. Never a Pixel2Mesh prediction.
export function createStudyGeometry(segments = 96, rings = 64) {
  const positions = [], indices = []
  for (let row = 0; row <= rings; row++) {
    const t = row / rings
    const y = (t - .5) * 2.7
    const body = .38 + .48 * Math.pow(Math.sin(Math.PI * t), 1.15)
    const neck = 1 - .3 * Math.exp(-Math.pow((t - .85) / .12, 2))
    for (let col = 0; col <= segments; col++) {
      const angle = col / segments * Math.PI * 2
      const radius = body * neck + .032 * Math.cos(angle * 24 + t * .65)
      positions.push(radius * Math.cos(angle), y, radius * Math.sin(angle))
      if (row < rings && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  return { positions, indices }
}
