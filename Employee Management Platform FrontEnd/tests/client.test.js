import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, tokenStore, AUTH_EXPIRED_EVENT } from '../src/api/client.js'
import { formatDate, formatDays, formatMoney, relativeTime } from '../src/lib/format.js'

/**
 * The HTTP client owns token refresh and error translation. Both are easy to
 * break and hard to notice in manual testing - a broken refresh only shows up
 * fifteen minutes into a session.
 */

// Minimal localStorage so the token store works outside a browser.
function installLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

// Both methods are needed: apiRequest reads bodies with text(), while the
// refresh path uses json().
function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

describe('apiRequest', () => {
  beforeEach(() => {
    installLocalStorage()
    globalThis.window = { dispatchEvent: vi.fn(), CustomEvent: class {} }
    globalThis.CustomEvent = class CustomEvent {
      constructor(type) {
        this.type = type
      }
    }
    tokenStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches the bearer token when one is stored', async () => {
    tokenStore.set({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }))
    globalThis.fetch = fetchMock

    await apiRequest('/employees')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer access-1')
  })

  it('drops empty query values instead of sending them as filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }))
    globalThis.fetch = fetchMock

    await apiRequest('/employees', { params: { q: '', status: 'ACTIVE', page: 1, missing: undefined } })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('status=ACTIVE')
    expect(url).toContain('page=1')
    expect(url).not.toContain('q=')
    expect(url).not.toContain('missing')
  })

  it('joins array params into the comma form the API accepts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }))
    globalThis.fetch = fetchMock

    await apiRequest('/employees', { params: { status: ['ACTIVE', 'PROBATION'] } })

    expect(fetchMock.mock.calls[0][0]).toContain('status=ACTIVE%2CPROBATION')
  })

  it('turns the API error envelope into a typed ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { reason: ['Add a short reason so your manager has context'] },
          requestId: 'req-abc',
        },
      }),
    )

    await expect(apiRequest('/requests/leave', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    })

    try {
      await apiRequest('/requests/leave', { method: 'POST', body: {} })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error.fieldError('reason')).toBe('Add a short reason so your manager has context')
      expect(error.requestId).toBe('req-abc')
    }
  })

  it('reports an unreachable server as a network error, not a crash', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiRequest('/employees')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  /**
   * The behaviour that keeps a session alive: one 401, one refresh, one retry.
   */
  it('refreshes once on a 401 and retries the original request', async () => {
    tokenStore.set({ accessToken: 'expired', refreshToken: 'refresh-1' })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { accessToken: 'access-2', refreshToken: 'refresh-2' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }))
    globalThis.fetch = fetchMock

    const result = await apiRequest('/me/profile')

    expect(result.data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh')
    // The rotated pair is stored for subsequent calls.
    expect(tokenStore.access).toBe('access-2')
    expect(tokenStore.refresh).toBe('refresh-2')
  })

  /**
   * Refresh tokens rotate server-side, so two concurrent refreshes would present
   * the same token twice and the API would revoke the whole session. Only one
   * refresh may be in flight.
   */
  it('refreshes only once when several requests fail at the same moment', async () => {
    tokenStore.set({ accessToken: 'expired', refreshToken: 'refresh-1' })

    let refreshCalls = 0
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1
        return jsonResponse(200, { data: { accessToken: 'access-2', refreshToken: 'refresh-2' } })
      }
      // Every call made with the stale token fails; the retried ones succeed.
      return tokenStore.access === 'expired'
        ? jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })
        : jsonResponse(200, { data: { ok: true } })
    })

    await Promise.all([apiRequest('/a'), apiRequest('/b'), apiRequest('/c')])

    expect(refreshCalls).toBe(1)
  })

  it('gives up and signals an expired session when the refresh itself fails', async () => {
    tokenStore.set({ accessToken: 'expired', refreshToken: 'dead' })
    const dispatch = vi.fn()
    globalThis.window = { dispatchEvent: dispatch }

    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'reused' } })
        : jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
    )

    await expect(apiRequest('/me/profile')).rejects.toMatchObject({ status: 401 })

    expect(tokenStore.access).toBeNull()
    expect(dispatch).toHaveBeenCalled()
    expect(dispatch.mock.calls[0][0].type).toBe(AUTH_EXPIRED_EVENT)
  })

  it('does not try to refresh a failed login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }))
    globalThis.fetch = fetchMock

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ status: 401 })

    // One call only - no refresh attempt on an unauthenticated endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('handles a 204 with no body', async () => {
    tokenStore.set({ accessToken: 'access-1' })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 204, ok: true, text: async () => '' })

    await expect(apiRequest('/documents/x', { method: 'DELETE' })).resolves.toBeNull()
  })
})

describe('formatters', () => {
  it('formats money in the entity currency, never a global default', () => {
    expect(formatMoney(27500, 'AED')).toContain('27,500')
    expect(formatMoney(27500, 'SAR')).toContain('27,500')
    expect(formatMoney(null, 'AED')).toBe('—')
  })

  it('formats dates and falls back for missing or invalid values', () => {
    expect(formatDate('2026-08-30')).toBe('30 Aug 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('pluralises days correctly', () => {
    expect(formatDays(1)).toBe('1 day')
    expect(formatDays(3)).toBe('3 days')
    expect(formatDays(0.5)).toBe('0.5 days')
  })

  it('describes recent times in words', () => {
    expect(relativeTime(new Date().toISOString())).toBe('Just now')
    expect(relativeTime(null)).toBe('')
  })
})
