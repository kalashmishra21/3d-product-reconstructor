const GENERIC_NAME = /^(?:input|image|photo|picture|upload|file|scan|object|model|untitled|screenshot)(?:[-_ ]?\d+)?$/i
const CAMERA_NAME = /^(?:img|dsc|pxl|image|photo)[-_ ]?\d{2,}$/i

export function deriveObjectName(filename = '') {
  const stem = String(filename).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim()
  if (!stem || GENERIC_NAME.test(stem) || CAMERA_NAME.test(stem)) return ''
  const words = stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words || !/[a-z]/i.test(words)) return ''
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function validateMeshResponse(data) {
  if (
    !data || data.status !== 'complete' || data.model !== 'Pixel2Mesh' || data.stage !== 3 ||
    data.vertices_count !== 2466 || data.faces_count !== 4928 ||
    !Number.isFinite(data.latency_ms) ||
    !Array.isArray(data.vertices) || data.vertices.length !== 2466 ||
    !Array.isArray(data.faces) || data.faces.length !== 4928
  ) return 'MESH DATA INVALID'

  if (data.vertices.some((vertex) =>
    !Array.isArray(vertex) || vertex.length !== 3 || vertex.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
    return 'MESH DATA INVALID'
  }
  if (data.faces.some((face) =>
    !Array.isArray(face) || face.length !== 3 || face.some((index) => !Number.isInteger(index) || index < 0 || index >= 2466))) {
    return 'MESH DATA INVALID'
  }
  if (data.model_init_ms !== undefined && (!Number.isFinite(data.model_init_ms) || data.model_init_ms < 0)) {
    return 'MESH DATA INVALID'
  }
  return ''
}

export function formatMilliseconds(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(1)} ms`
}
