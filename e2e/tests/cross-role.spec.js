import { test, expect } from '@playwright/test'
import { ACCOUNTS, gotoPage, leaveSlot, newestRequestRef, signIn, signOut, trackPageHealth } from '../helpers.js'

/**
 * The end-to-end shape the brief actually asks for: an employee submits, HR
 * decides, the employee sees the outcome. Each test does the whole round trip in
 * one browser, signing out and back in between roles so the result is read from
 * the database rather than from surviving client state.
 */
test.describe('Cross-role workflow round trips', () => {
  test('leave: employee submits -> admin approves -> employee sees the decision and the balance moves', async ({ page }) => {
    const health = trackPageHealth(page)

    // --- employee submits ---
    await signIn(page, ACCOUNTS.employee)
    const before = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })

    const { startDate, endDate } = leaveSlot('crossRoleApprove')
    await page.getByRole('button', { name: 'Request leave' }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.locator('input[type=date]').first().fill(startDate)
    await dialog.locator('input[type=date]').nth(1).fill(endDate)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('E2E cross-role - approve me')
    // The preview is debounced; wait for it before reading the chargeable days.
    await expect(dialog).toContainText(/uses \d+(\.\d+)? working day/)
    const chargeable = Number((await dialog.innerText()).match(/uses (\d+(?:\.\d+)?) working day/)?.[1])
    expect(chargeable).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Submit request' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await gotoPage(page, 'My requests')
    const reference = await newestRequestRef(page, 'LEAVE')
    expect(reference, 'a leave reference should be visible to the employee').toBeTruthy()

    // --- admin decides ---
    await signOut(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Requests')

    const row = page.locator('tbody tr').filter({ hasText: reference })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.click()

    dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('E2E cross-role - approve me')
    await dialog.getByRole('textbox', { name: /Decision note/ }).fill('Approved by the E2E acceptance suite.')
    await dialog.getByRole('button', { name: 'Approve request' }).click()
    await expect(dialog).toContainText('Approved', { timeout: 20_000 })

    // --- employee sees the outcome after a fresh sign-in ---
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await signOut(page)
    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My requests')

    const decided = page.locator('body')
    await expect(decided).toContainText(reference)
    await expect(decided).toContainText('Approved')
    await expect(decided).toContainText('Approved by the E2E acceptance suite.')

    const after = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })
    // Approval converts the hold into consumed days.
    expect(Number(after.usedDays)).toBeCloseTo(Number(before.usedDays) + chargeable, 2)
    expect(Number(after.pendingDays)).toBeCloseTo(Number(before.pendingDays), 2)
    health.assertClean()
  })

  test('leave: rejection releases the held balance and shows the reason', async ({ page }) => {
    const health = trackPageHealth(page)

    await signIn(page, ACCOUNTS.employee)
    const before = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })

    const { startDate, endDate } = leaveSlot('crossRoleReject')
    await page.getByRole('button', { name: 'Request leave' }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.locator('input[type=date]').first().fill(startDate)
    await dialog.locator('input[type=date]').nth(1).fill(endDate)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('E2E cross-role - reject me')
    await expect(dialog).toContainText(/uses \d+(\.\d+)? working day/)
    await dialog.getByRole('button', { name: 'Submit request' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await gotoPage(page, 'My requests')
    const reference = await newestRequestRef(page, 'LEAVE')
    expect(reference).toBeTruthy()

    await signOut(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Requests')
    await page.locator('tbody tr').filter({ hasText: reference }).click()

    dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: /Decision note/ }).fill('Team is short-staffed that week.')
    await dialog.getByRole('button', { name: 'Reject' }).click()
    await expect(dialog).toContainText('Rejected', { timeout: 20_000 })

    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await signOut(page)
    await signIn(page, ACCOUNTS.employee)

    const after = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })
    // The hold is released and nothing was consumed.
    expect(Number(after.pendingDays)).toBeCloseTo(Number(before.pendingDays), 2)
    expect(Number(after.usedDays)).toBeCloseTo(Number(before.usedDays), 2)
    expect(Number(after.availableDays)).toBeCloseTo(Number(before.availableDays), 2)

    await gotoPage(page, 'My requests')
    await expect(page.locator('body')).toContainText('Team is short-staffed that week.')
    health.assertClean()
  })

  test('document: approval issues a bilingual letter the employee can read', async ({ page }) => {
    const health = trackPageHealth(page)

    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My requests')
    await page.getByRole('button', { name: /Request document/i }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: /Purpose|What is it for/i }).first().fill('E2E cross-role - issue my letter')
    await dialog.getByRole('button', { name: /Submit request/i }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    const reference = await newestRequestRef(page, 'DOCUMENT')
    expect(reference).toBeTruthy()

    await signOut(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Requests')
    await page.locator('tbody tr').filter({ hasText: reference }).click()

    dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Approve request' }).click()
    await expect(dialog).toContainText('Approved', { timeout: 20_000 })

    // The letter exists, is readable, and is labelled with its provenance.
    await dialog.getByRole('button', { name: /Read letter/i }).click()
    const letter = page.getByRole('dialog').last()
    await expect(letter).toContainText('To Whom It May Concern')
    await expect(letter).toContainText('Matajer Retail Technologies FZ-LLC')
    // With no GOOGLE_API_KEY configured the deterministic template is used, and
    // the UI says so rather than implying a model wrote it.
    await expect(letter).toContainText('Standard template')
    // Bilingual: the Arabic tab is offered.
    await expect(letter.getByRole('button', { name: 'العربية' })).toBeVisible()
    health.assertClean()
  })

  test('profile change: approval applies the field the employee proposed', async ({ page }) => {
    const health = trackPageHealth(page)

    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My requests')
    await page.getByRole('button', { name: /Update details/i }).first().click()
    let dialog = page.getByRole('dialog')
    // Submit is disabled until a value actually differs from the stored record.
    const cityField = dialog.getByRole('textbox', { name: 'City' })
    const proposedCity = (await cityField.inputValue()) === 'Sharjah' ? 'Fujairah' : 'Sharjah'
    await cityField.fill(proposedCity)
    const submit = dialog.getByRole('button', { name: /Submit for approval/i })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    const reference = await newestRequestRef(page, 'PROFILE_CHANGE')
    expect(reference).toBeTruthy()

    await signOut(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Requests')
    await page.locator('tbody tr').filter({ hasText: reference }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Approve request' }).click()
    await expect(dialog).toContainText('Approved', { timeout: 20_000 })

    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await signOut(page)
    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My profile')
    // The approved value is now on the record.
    await expect(page.locator('body')).toContainText(proposedCity)
    health.assertClean()
  })

  test('deciding a request updates the sidebar pending badge, not just the list', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Requests')

    const badge = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: /^Requests/ })
    const readBadge = async () => Number((await badge.innerText()).match(/(\d+)/)?.[1] ?? 0)
    const before = await readBadge()
    expect(before).toBeGreaterThan(0)

    await page.locator('tbody tr').first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: /Decision note/ }).fill('Cleared by the E2E suite.')
    await dialog.getByRole('button', { name: 'Approve request' }).click()
    await expect(dialog).toContainText('Approved', { timeout: 20_000 })

    await expect.poll(readBadge, { timeout: 20_000 }).toBe(before - 1)
  })
})
