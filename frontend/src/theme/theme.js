export const THEME_KEY = 'reconstruct.theme'
export function resolveTheme(value, prefersDark = true) {
  return value === 'forest' || value === 'ivory' ? value : prefersDark ? 'forest' : 'ivory'
}
export function readTheme(storage, prefersDark) {
  try { return resolveTheme(storage.getItem(THEME_KEY), prefersDark) }
  catch { return resolveTheme(null, prefersDark) }
}
export function storeTheme(storage, value) {
  if (value !== 'forest' && value !== 'ivory') return
  try { storage.setItem(THEME_KEY, value) } catch { /* Private/blocked storage: the live theme still works. */ }
}
// Presentation only. No geometry, camera fitting or export data belongs here.
export const sceneThemes = {
  forest: { solid: '#d4dbc3', wire: '#c2d1ae', points: '#f0edde', grid: '#3c5140', gridCenter: '#6c8167', ambient: .85, key: '#fff3da', fill: '#afc7b1' },
  ivory: { solid: '#6b866d', wire: '#294932', points: '#22382b', grid: '#bdc7b4', gridCenter: '#879c7d', ambient: 1.15, key: '#fff8e8', fill: '#a4b89b' },
}
