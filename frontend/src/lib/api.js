import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '',
  timeout: 5000,
  headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
})

export async function getHealth(signal, client = api) {
  const { data } = await client.get('/api/v1/health', { signal })
  if (
    typeof data !== 'object' || data === null ||
    data.status !== 'ok' || data.service !== '3d-reconstruction-api'
  ) throw new Error('The API returned an unexpected health response.')

  return { status: data.status, service: data.service }
}
