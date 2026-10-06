import { saveProfile } from '../lib/profile.js'
import { removeObjects, signedImageUrl, uploadAvatar } from '../lib/storage.js'

export const MAX_AVATAR_BYTES = 3 * 1024 * 1024
export const MAX_AVATAR_PIXELS = 16_000_000

function signature(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp'
  return ''
}

async function decodeAvatar(file) {
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
  } finally { URL.revokeObjectURL(url) }
}

export async function validateAvatar(file, decode = decodeAvatar) {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  if (!file || !Object.hasOwn(extensions, file.type)) throw new Error('Choose a JPEG, PNG, or WebP avatar.')
  if (!file.size) throw new Error('The avatar image is empty.')
  if (file.size > MAX_AVATAR_BYTES) throw new Error('Avatar exceeds the 3 MB limit.')
  const detected = signature(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (detected !== file.type) throw new Error('Avatar image format does not match its file type.')
  let dimensions
  try { dimensions = await decode(file) }
  catch { throw new Error('Unable to decode avatar image.') }
  const { width, height } = dimensions ?? {}
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_AVATAR_PIXELS) {
    throw new Error('Avatar dimensions are invalid or too large.')
  }
  return { mime: detected, extension: extensions[detected], width, height }
}

function ownAvatarPath(userId, path) {
  return typeof path === 'string' && path.startsWith(`${userId}/`) && !path.includes('..')
}

export async function replaceAvatar(userId, file, previousPath, services = {}) {
  const validate = services.validateAvatar ?? validateAvatar
  const upload = services.uploadAvatar ?? uploadAvatar
  const save = services.saveProfile ?? saveProfile
  const remove = services.removeObjects ?? removeObjects
  const sign = services.signedImageUrl ?? signedImageUrl
  const makeId = services.makeId ?? (() => crypto.randomUUID())
  await validate(file)
  const newPath = await upload(userId, makeId(), file)
  let profile
  try { profile = await save(userId, { avatar_path: newPath }) }
  catch (error) {
    await remove('avatars', [newPath]).catch(() => {})
    throw error
  }
  let cleanupWarning = false
  if (ownAvatarPath(userId, previousPath) && previousPath !== newPath) {
    try { await remove('avatars', [previousPath]) }
    catch { cleanupWarning = true }
  }
  let avatarUrl = ''
  try { avatarUrl = await sign('avatars', newPath) }
  catch { cleanupWarning = true }
  return { profile, avatarUrl, cleanupWarning }
}

export async function removeAvatar(userId, previousPath, services = {}) {
  const remove = services.removeObjects ?? removeObjects
  const save = services.saveProfile ?? saveProfile
  if (ownAvatarPath(userId, previousPath)) await remove('avatars', [previousPath])
  return save(userId, { avatar_path: null })
}
