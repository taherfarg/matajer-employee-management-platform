import { expect } from '@playwright/test'

export const DEMO_PASSWORD = 'Passw0rd!23'

export const ACCOUNTS = {
  admin: 'admin@matajer.demo',
  hrKsa: 'hr.ksa@matajer.demo',
  manager: 'manager@matajer.demo',
  employee: 'employee@matajer.demo',
}

/** Signs in through the real login form and waits for the workspace to render. */
export async function signIn(page, email, password = DEMO_PASSWORD) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Work email' }).fill(email)
  await page.getByRole('textbox', { name: /Password/ }).first().fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
}

export async function signOut(page) {
  await openNavIfCollapsed(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
}

/** On mobile the sidebar is behind a hamburger; on desktop it is always open. */
export async function openNavIfCollapsed(page) {
  const burger = page.getByRole('button', { name: 'Open navigation' })
  if (await burger.isVisible().catch(() => false)) {
    await burger.click()
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  }
}

export async function gotoPage(page, label) {
  await openNavIfCollapsed(page)
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: new RegExp(`^${label}`) }).click()
}

/**
 * Calls the API with the token the app already stored, so a test can assert on
 * persisted state (or probe an endpoint the UI does not expose) using exactly
 * the caller's own credentials.
 */
export async function apiAs(page, path, options = {}) {
  return page.evaluate(
    async ([p, opts]) => {
      const token = localStorage.getItem('ems.accessToken')
      const res = await fetch(`/api/v1${p}`, {
        method: opts.method || 'GET',
        headers: {
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      })
      let json = null
      try { json = await res.json() } catch { /* no body */ }
      return { status: res.status, body: json }
    },
    [path, options],
  )
}

/**
 * The reference of the caller's newest request of a given type, read from the
 * API rather than scraped from the page.
 *
 * Scraping the rendered list is racy: the list reloads asynchronously after a
 * submission, so reading it too early returns a *seeded* request's reference and
 * the test then drives the wrong record. Polling the API removes that race
 * entirely - it is the same data the list is about to show.
 */
export async function newestRequestRef(page, type, { notBefore = null } = {}) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const res = await apiAs(page, `/me/requests?type=${type}&pageSize=1&sortBy=submittedAt&sortOrder=desc`)
    const newest = res.body?.data?.[0]
    if (newest?.reference && newest.reference !== notBefore) return newest.reference
    await page.waitForTimeout(250)
  }
  throw new Error(`Timed out waiting for a new ${type} request to appear`)
}

/** Fails the test if the browser logged an error or a request 5xx'd. */
export function trackPageHealth(page) {
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(`uncaught: ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 500 && res.url().includes('/api/')) failedRequests.push(`${res.status()} ${res.url()}`)
  })
  return {
    assertClean() {
      expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([])
      expect(failedRequests, `5xx responses: ${failedRequests.join(' | ')}`).toEqual([])
    },
  }
}

/**
 * A leave window reserved for one specific test.
 *
 * Two constraints make these fixed rather than computed:
 *
 *  - Leave balances are tracked per calendar year and `/me/leave-balances`
 *    reports the current one, so a request has to fall inside the current year
 *    for a before/after balance assertion to mean anything.
 *  - The overlap guard rejects a request touching any pending or approved one,
 *    so each test needs a window no other test and no seeded request occupies.
 *
 * Every slot below is a Mon-Tue pair (a working day in all three entities'
 * weeks bar none), well clear of the seeded requests and of each other.
 */
const LEAVE_SLOTS = {
  employeeBalance: ['10-12', '10-13'],
  employeeWithdraw: ['11-09', '11-10'],
  crossRoleApprove: ['10-26', '10-27'],
  crossRoleReject: ['11-23', '11-24'],
}

export function leaveSlot(name) {
  const slot = LEAVE_SLOTS[name]
  if (!slot) throw new Error(`Unknown leave slot: ${name}`)
  const year = new Date().getUTCFullYear()
  return { startDate: `${year}-${slot[0]}`, endDate: `${year}-${slot[1]}` }
}
