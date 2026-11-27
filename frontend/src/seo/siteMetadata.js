export const SOFTWARE_APPLICATION_JSON_LD = Object.freeze({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Reconstruct',
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Web browser',
  description: 'A browser-based Pixel3Mesh workspace reconstructing a single RGB image with camera calibration into 2,048-point predictions and a visible-surface OBJ.',
})

export function routeRobotsContent(pathname) {
  return pathname === '/' ? 'index, follow' : 'noindex, nofollow'
}
