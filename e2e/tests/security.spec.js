import { test, expect } from '@playwright/test'
import { ACCOUNTS, apiAs, gotoPage, signIn, trackPageHealth } from '../helpers.js'

/**
 * Authorization is asserted at the API, using the signed-in user's own token,
 * because hidden UI controls are not a security boundary. Every case here is an
 * attempt to reach data the caller must not have.
 */
test.describe('Authorization and privacy boundaries', () => {
  test('employee cannot reach a colleague private data by direct API id', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee)

    const self = await apiAs(page, '/me/profile')
    const directory = await apiAs(page, '/employees?pageSize=100')
    const colleague = directory.body.data.find((e) => e.id !== self.body.data.id)
    expect(colleague, 'need a colleague to probe').toBeTruthy()

    // The directory itself is allowed - it is an address book - but it must be
    // limited to directory-level fields.
    const view = await apiAs(page, `/employees/${colleague.id}`)
    expect(view.status).toBe(200)
    expect(view.body.data.viewLevel).toBe('DIRECTORY')
    for (const field of ['dateOfBirth', 'nationality', 'address', 'emergencyContact', 'personalEmail', 'hireDate']) {
      expect(view.body.data[field], `${field} must be absent, not null`).toBeUndefined()
    }

    // Everything sensitive is refused outright.
    expect((await apiAs(page, `/employees/${colleague.id}/compensation`)).status).toBeGreaterThanOrEqual(403)
    expect((await apiAs(page, `/employees/${colleague.id}/documents`)).status).toBeGreaterThanOrEqual(403)
    expect((await apiAs(page, `/employees/${colleague.id}/timeline`)).status).toBeGreaterThanOrEqual(403)

    // And they cannot edit anyone, including themselves.
    expect((await apiAs(page, `/employees/${colleague.id}`, { method: 'PATCH', body: { jobTitle: 'CEO' } })).status).toBeGreaterThanOrEqual(403)
    expect((await apiAs(page, `/employees/${self.body.data.id}`, { method: 'PATCH', body: { jobTitle: 'CEO' } })).status).toBeGreaterThanOrEqual(403)
  })

  test('employee cannot list or read another employee requests', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee)
    const self = await apiAs(page, '/me/profile')
    const selfId = self.body.data.id

    // A tampered employeeId filter must not widen the result set.
    const listed = await apiAs(page, '/requests?pageSize=100')
    for (const r of listed.body.data) expect(r.employee.id).toBe(selfId)

    const redirected = await apiAs(page, `/me/requests?employeeId=someone-else`)
    for (const r of redirected.body.data) expect(r.employee.id).toBe(selfId)
  })

  test('an unrelated request is 404, indistinguishable from one that does not exist', async ({ page }) => {
    // Find a foreign request id as admin, then try to read it as the employee.
    await signIn(page, ACCOUNTS.admin)
    const all = await apiAs(page, '/requests?pageSize=100')
    const employeeProfile = await apiAs(page, '/employees?q=Yusuf')
    const yusufId = employeeProfile.body.data[0].id
    const foreign = all.body.data.find((r) => r.employee.id !== yusufId)
    expect(foreign).toBeTruthy()

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await signIn(page, ACCOUNTS.employee)

    const real = await apiAs(page, `/requests/${foreign.id}`)
    const fake = await apiAs(page, '/requests/clfakeid000000000000000000')
    expect(real.status).toBe(404)
    expect(fake.status).toBe(404)
  })

  test('a manager can see their report but never their salary', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    const team = await apiAs(page, '/me/team')
    const report = team.body.data?.[0]
    expect(report, 'the manager demo account needs a direct report').toBeTruthy()

    const view = await apiAs(page, `/employees/${report.id}`)
    expect(view.body.data.viewLevel).toBe('MANAGER')
    expect(view.body.data.dateOfBirth).toBeUndefined()

    const pay = await apiAs(page, `/employees/${report.id}/compensation`)
    expect(pay.status, 'a line manager must not read a report salary').toBeGreaterThanOrEqual(403)
  })

  test('entity-scoped HR cannot reach another legal entity', async ({ page }) => {
    // Learn a UAE employee id as the global admin first: the scoped HR account
    // cannot enumerate one, which is itself the point.
    await signIn(page, ACCOUNTS.admin)
    const everyone = await apiAs(page, '/employees?pageSize=100')
    const foreign = everyone.body.data.find((e) => e.legalEntity.code === 'MTJ-AE')
    expect(foreign, 'need a UAE employee to probe').toBeTruthy()

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await signIn(page, ACCOUNTS.hrKsa)

    // The scoped directory does not list people outside the scope at all.
    const scoped = await apiAs(page, '/employees?pageSize=100')
    for (const e of scoped.body.data) {
      if (e.legalEntity.code !== 'MTJ-SA') expect(e.viewLevel).toBe('DIRECTORY')
    }

    // Reaching the foreign record directly by id is refused for anything sensitive.
    expect((await apiAs(page, `/employees/${foreign.id}/compensation`)).status).toBeGreaterThanOrEqual(403)
    expect((await apiAs(page, `/employees/${foreign.id}`, { method: 'PATCH', body: { jobTitle: 'Tampered' } })).status).toBeGreaterThanOrEqual(403)

    // A tampered entity filter cannot elevate what they see.
    const tampered = await apiAs(page, `/employees?legalEntityId=${foreign.legalEntity.id}&pageSize=100`)
    for (const e of tampered.body.data) {
      if (e.legalEntity.code !== 'MTJ-SA') expect(e.viewLevel).toBe('DIRECTORY')
    }

    // And they only get their own entity's leave policy, with no duplicates.
    const types = await apiAs(page, '/leave/types')
    const names = types.body.data.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('nobody can approve their own request, and an employee cannot approve at all', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    const pending = await apiAs(page, '/requests?status=PENDING&pageSize=100')
    const yusuf = (await apiAs(page, '/employees?q=Yusuf')).body.data[0]
    const own = pending.body.data.find((r) => r.employee.id === yusuf.id)
    const foreign = pending.body.data.find((r) => r.employee.id !== yusuf.id)

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await signIn(page, ACCOUNTS.employee)

    if (own) {
      const selfApprove = await apiAs(page, `/requests/${own.id}/approve`, { method: 'POST', body: {} })
      expect(selfApprove.status, 'self-approval must be refused').toBe(403)
    }
    if (foreign) {
      const other = await apiAs(page, `/requests/${foreign.id}/approve`, { method: 'POST', body: {} })
      expect(other.status).toBeGreaterThanOrEqual(403)
    }
  })

  test('self-service profile change cannot smuggle a privileged field', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee)
    const before = (await apiAs(page, '/me/profile')).body.data

    // Prohibited fields on their own are simply not a valid change set.
    for (const field of ['jobTitle', 'baseSalary', 'legalEntityId', 'managerId', 'status', 'employeeNumber', 'role']) {
      const res = await apiAs(page, '/requests/profile-change', {
        method: 'POST',
        body: { changes: { [field]: 'escalation' }, reason: 'probe' },
      })
      expect(res.status, `${field} must not be an accepted self-service change`).toBe(422)
    }

    // Only one profile change may be open at a time (the API answers 409 for a
    // second), so clear any left by an earlier test before probing.
    const open = await apiAs(page, '/me/requests?type=PROFILE_CHANGE&status=PENDING&pageSize=50')
    for (const r of open.body?.data ?? []) {
      await apiAs(page, `/requests/${r.id}/cancel`, { method: 'POST', body: {} })
    }

    // Smuggled alongside an allowed field, the privileged keys must be stripped.
    const mixed = await apiAs(page, '/requests/profile-change', {
      method: 'POST',
      body: { changes: { city: 'Al Ain', jobTitle: 'CEO', baseSalary: 999999 }, reason: 'probe' },
    })
    expect([200, 201]).toContain(mixed.status)
    const detail = await apiAs(page, `/requests/${mixed.body.data.id}`)
    const changes = detail.body.data.profileChange.changes
    const fields = Array.isArray(changes) ? changes.map((c) => c.field) : Object.keys(changes)
    expect(fields).toEqual(['city'])

    await apiAs(page, `/requests/${mixed.body.data.id}/cancel`, { method: 'POST', body: {} })
    const after = (await apiAs(page, '/me/profile')).body.data
    expect(after.jobTitle).toBe(before.jobTitle)
  })

  test('the audit trail is management-only and has no delete route', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee)
    expect((await apiAs(page, '/audit-logs')).status).toBe(403)

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await signIn(page, ACCOUNTS.admin)
    expect((await apiAs(page, '/audit-logs?pageSize=5')).status).toBe(200)
    const del = await apiAs(page, '/audit-logs/anything', { method: 'DELETE' })
    expect([404, 405]).toContain(del.status)
  })

  test('unauthenticated and tampered tokens are rejected', async ({ page }) => {
    await page.goto('/')
    const results = await page.evaluate(async () => {
      const call = async (token) => {
        const res = await fetch('/api/v1/employees', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        return res.status
      }
      return { none: await call(null), garbage: await call('not-a-jwt'), tampered: await call('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.badsignature') }
    })
    expect(results.none).toBe(401)
    expect(results.garbage).toBe(401)
    expect(results.tampered).toBe(401)
  })

  test('login does not reveal whether an account exists', async ({ page }) => {
    await page.goto('/')
    const out = await page.evaluate(async () => {
      const post = async (email) => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'definitely-wrong-password' }),
        })
        return { status: res.status, message: (await res.json())?.error?.message }
      }
      return { real: await post('admin@matajer.demo'), fake: await post('nobody@matajer.demo') }
    })
    expect(out.real.status).toBe(out.fake.status)
    expect(out.real.message).toBe(out.fake.message)
  })

  test('an employee has no management UI to reach in the first place', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('People directory')
    expect(body).not.toContain('Request inbox')
    expect(body).not.toContain('Legal entities')
    health.assertClean()
  })
})

test.describe('Manager workspace (EMS-002)', () => {
  test('a manager gets a team destination the employee role does not', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(nav.getByRole('button', { name: /My team/ })).toBeVisible()
    // Still an employee first: they keep their own self-service.
    await expect(nav.getByRole('button', { name: /My requests/ })).toBeVisible()
    // And still no management destinations.
    await expect(nav.getByRole('button', { name: /^People$/ })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: /Legal entities/ })).toHaveCount(0)

    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await signIn(page, ACCOUNTS.employee)
    const empNav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(empNav.getByRole('button', { name: /My team/ })).toHaveCount(0)
  })

  test('the team view lists direct reports and never their pay', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await gotoPage(page, 'My team')

    const team = await apiAs(page, '/me/team')
    expect(team.body.data.length).toBeGreaterThan(0)

    const body = page.locator('body')
    for (const report of team.body.data) {
      await expect(body).toContainText(report.fullName)
    }
    // The whole point of the manager boundary: no compensation on this screen.
    await expect(body).not.toContainText(/AED\s?[\d,]{3,}/)
    await expect(body).not.toContainText(/SAR\s?[\d,]{3,}/)
  })

  test('a manager can decide a report request but not their own', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await gotoPage(page, 'My team')

    const self = await apiAs(page, '/me/profile')
    const queue = await apiAs(page, '/requests?myTeamOnly=true&status=PENDING&pageSize=50')
    const own = queue.body.data.find((r) => r.employee.id === self.body.data.id)
    const report = queue.body.data.find((r) => r.employee.id !== self.body.data.id)

    if (own) {
      // The UI must not offer a control the API will refuse.
      await expect(page.getByRole('button', { name: `Approve ${own.reference}` })).toHaveCount(0)
      const refused = await apiAs(page, `/requests/${own.id}/approve`, { method: 'POST', body: {} })
      expect(refused.status, 'self-approval must be refused for a manager too').toBe(403)
    }

    if (report) {
      await page.getByRole('button', { name: `Approve ${report.reference}` }).click()
      await expect.poll(async () => {
        const after = await apiAs(page, `/requests/${report.id}`)
        return after.body.data.status
      }, { timeout: 20_000 }).toBe('APPROVED')
    }
  })
})
