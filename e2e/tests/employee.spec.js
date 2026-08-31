import { test, expect } from '@playwright/test'
import { ACCOUNTS, gotoPage, leaveSlot, newestRequestRef, signIn, trackPageHealth } from '../helpers.js'

test.describe('Employee self-service experience', () => {
  test('employee lands on a self-service workspace, not the management one', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)

    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(nav.getByRole('button', { name: /^Home/ })).toBeVisible()
    await expect(nav.getByRole('button', { name: /^My profile/ })).toBeVisible()
    await expect(nav.getByRole('button', { name: /^My requests/ })).toBeVisible()

    // Management destinations must not exist for this role.
    await expect(nav.getByRole('button', { name: /^People$/ })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: /^Legal entities/ })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: /^Overview/ })).toHaveCount(0)
    health.assertClean()
  })

  test('own profile shows employment details and own compensation', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My profile')

    const body = page.locator('body')
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
    await expect(body).toContainText('Yusuf Karim')
    await expect(body).toContainText('Senior Backend Engineer')
    // Linked to their legal entity, and their own salary in that entity's currency.
    await expect(body).toContainText('Matajer UAE')
    await expect(body).toContainText(/AED\s?[\d,]+/)
    await expect(body).toContainText('My employment timeline')
    health.assertClean()
  })

  test('leave preview applies the entity working week and names skipped holidays', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)

    await page.getByRole('button', { name: 'Request leave' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The dropdown must offer this employee's own entity policy only - no
    // duplicated "Annual Leave" rows from the other legal entities.
    const options = await dialog.getByRole('combobox', { name: 'Leave type' }).locator('option').allInnerTexts()
    const names = options.map((o) => o.trim())
    expect(new Set(names).size, `duplicate leave types offered: ${names.join(', ')}`).toBe(names.length)

    // 1-8 Dec 2026 spans a UAE weekend and three UAE public holidays.
    await dialog.locator('input[type=date]').first().fill('2026-12-01')
    await dialog.locator('input[type=date]').nth(1).fill('2026-12-08')

    await expect(dialog).toContainText('3 working days')
    await expect(dialog).toContainText('Commemoration Day')
    await expect(dialog).toContainText('UAE National Day')
    health.assertClean()
  })

  test('submitting leave holds the balance and shows a pending request', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)

    const before = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })

    const { startDate, endDate } = leaveSlot('employeeBalance')
    await page.getByRole('button', { name: 'Request leave' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=date]').first().fill(startDate)
    await dialog.locator('input[type=date]').nth(1).fill(endDate)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('E2E acceptance - planned time off')

    // The preview is a debounced round trip; read the number only once it is on
    // screen, otherwise the chargeable days parse as zero.
    await expect(dialog).toContainText(/uses \d+(\.\d+)? working day/)
    const chargeable = Number((await dialog.innerText()).match(/uses (\d+(?:\.\d+)?) working day/)?.[1])
    expect(chargeable).toBeGreaterThan(0)

    await dialog.getByRole('button', { name: 'Submit request' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    const after = await page.evaluate(async () => {
      const t = localStorage.getItem('ems.accessToken')
      const r = await fetch('/api/v1/me/leave-balances', { headers: { Authorization: `Bearer ${t}` } })
      return (await r.json()).data.find((b) => /annual/i.test(b.leaveType.name))
    })

    expect(Number(after.pendingDays)).toBeCloseTo(Number(before.pendingDays) + chargeable, 2)
    expect(Number(after.availableDays)).toBeCloseTo(Number(before.availableDays) - chargeable, 2)

    await gotoPage(page, 'My requests')
    // The card is identified by its reference; the stated reason is private and
    // deliberately not rendered on the employee's own leave card.
    const card = page.locator('article').filter({ hasText: /LV-\d{4}-\d{4}/ }).first()
    await expect(card).toContainText('Pending')
    health.assertClean()
  })

  test('employee can submit a document request', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My requests')

    await page.getByRole('button', { name: /Request document/i }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: /Purpose|What is it for/i }).first().fill('E2E acceptance - embassy application')
    await dialog.getByRole('button', { name: /Submit request/i }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await expect(page.locator('body')).toContainText('E2E acceptance - embassy application')
    health.assertClean()
  })

  test('employee can submit a profile change and it stays pending until approved', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)
    await gotoPage(page, 'My requests')

    await page.getByRole('button', { name: /Update details/i }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Submit stays disabled until a value actually differs from the record, so
    // derive a value that is guaranteed to be a change.
    const cityField = dialog.getByRole('textbox', { name: 'City' })
    const currentCity = await cityField.inputValue()
    const proposedCity = currentCity === 'Abu Dhabi' ? 'Al Ain' : 'Abu Dhabi'
    await cityField.fill(proposedCity)

    const submit = dialog.getByRole('button', { name: /Submit for approval/i })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await expect(page.locator('body')).toContainText('Profile update')

    // The value must NOT have been applied yet - it needs HR approval.
    await gotoPage(page, 'My profile')
    await expect(page.locator('body')).not.toContainText(proposedCity)
    health.assertClean()
  })

  test('employee can withdraw their own pending request', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)

    const { startDate, endDate } = leaveSlot('employeeWithdraw')
    await page.getByRole('button', { name: 'Request leave' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=date]').first().fill(startDate)
    await dialog.locator('input[type=date]').nth(1).fill(endDate)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('E2E acceptance - to be withdrawn')
    await expect(dialog).toContainText(/uses \d+(\.\d+)? working day/)
    await dialog.getByRole('button', { name: 'Submit request' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    // Resolve the reference from the API, not from the list: the rendered list
    // reloads asynchronously and reading it too early picks a seeded request.
    const reference = await newestRequestRef(page, 'LEAVE')

    await gotoPage(page, 'My requests')
    const card = page.locator('article').filter({ hasText: reference })
    await expect(card).toContainText('Pending')

    await card.getByRole('button', { name: 'Withdraw request' }).click()

    const settled = page.locator('article').filter({ hasText: reference })
    await expect(settled).toContainText('Cancelled', { timeout: 20_000 })
    health.assertClean()
  })
})
