// Client for the Byhnex API (/api), same origin, session in an HttpOnly cookie.
import type { SyncData } from './sync-core'

export interface AccountUser {
  email: string
  createdAt: string
}

export interface ServerData {
  version: number
  updatedAt: string | null
  data: SyncData | null
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly server?: ServerData,
  ) {
    super(message)
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
  server?: ServerData
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  // Writes carry the custom header the API requires against cross-site requests.
  const headers: Record<string, string> = method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'byhnex' }
  const r = await fetch('/api' + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await r.json().catch(() => ({}))) as unknown
  if (!r.ok) {
    const e = json as ErrorBody
    throw new ApiError(e.error?.message || `Le serveur ne répond pas (${r.status}). Réessayez.`, r.status, e.error?.code, e.server)
  }
  return json as T
}

export const accountApi = {
  me: () => api<{ user: AccountUser }>('GET', '/auth/me'),
  login: (email: string, password: string) => api<{ user: AccountUser }>('POST', '/auth/login', { email, password }),
  register: (email: string, password: string) => api<{ user: AccountUser }>('POST', '/auth/register', { email, password }),
  logout: () => api<{ ok: true }>('POST', '/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) => api<{ ok: true }>('POST', '/auth/password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => api<{ ok: true }>('DELETE', '/account', { password }),
  readData: () => api<ServerData>('GET', '/data'),
  writeData: (baseVersion: number, data: SyncData) => api<{ version: number; updatedAt: string }>('PUT', '/data', { baseVersion, data }),
}
