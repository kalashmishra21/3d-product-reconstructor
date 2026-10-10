export const SOFTWARE_APPLICATION_JSON_LD = Object.freeze({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Reconstruct',
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Web browser',
  description: 'A browser-based workspace exploring 3D object reconstruction from a single RGB image, inspecting Pixel2Mesh geometry, and exporting OBJ or GLB assets.',
})

export function routeRobotsContent(pathname) {
  return pathname === '/' ? 'index, follow' : 'noindex, nofollow'
}
