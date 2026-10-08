const RESULT_PATH = /^\/reconstructions\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKSPACE_PATHS = new Set(['/dashboard', '/reconstruct', '/history', '/model'])

export function safeWorkspaceNext(path) {
  return typeof path === 'string' && (WORKSPACE_PATHS.has(path) || RESULT_PATH.test(path))
    ? path : '/dashboard'
}
