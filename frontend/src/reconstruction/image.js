export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 25_000_000
export const IMAGE_TYPES = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateImageFile(file) {
  if (!file || !Object.hasOwn(IMAGE_TYPES, file.type)) return 'Unsupported image format. Choose JPEG, PNG, or WebP.'
  if (!file.size) return 'The image is empty.'
  if (file.size > MAX_IMAGE_BYTES) return 'Image exceeds the 10 MB limit.'
  return ''
}

async function browserDimensions(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try { return { width: bitmap.width, height: bitmap.height } }
    finally { bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function inspectImageFile(file, decode = browserDimensions) {
  const issue = validateImageFile(file)
  if (issue) throw new Error(issue)
  let dimensions
  try { dimensions = await decode(file) }
  catch { throw new Error('Unable to decode image.') }
  const { width, height } = dimensions ?? {}
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Image dimensions are invalid.')
  }
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions exceed the safe limit.')
  return { file, width, height, format: IMAGE_TYPES[file.type] }
}
