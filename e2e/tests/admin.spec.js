import { test, expect } from '@playwright/test'
import { ACCOUNTS, apiAs, gotoPage, signIn, signOut, trackPageHealth } from '../helpers.js'

test.describe('Admin / management experience', () => {
  test('dashboard loads with real organisation data', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/)
    // Headcount, active, open requests, on-leave tiles all render a number.
    await expect(page.getByText('Total headcount')).toBeVisible()
    await expect(page.getByText('Open requests')).toBeVisible()
    // The entity breakdown is the multi-entity model made visible.
    await expect(page.getByText('Matajer UAE')).toBeVisible()
    await expect(page.getByText('Matajer Saudi Arabia')).toBeVisible()
    health.assertClean()
  })

  test('legal entities page shows every entity with its own working week and currency', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'Legal entities')

    await expect(page.getByRole('heading', { name: 'Legal entities' })).toBeVisible()
    const body = page.locator('body')
    await expect(body).toContainText('MTJ-AE')
    await expect(body).toContainText('MTJ-SA')
    await expect(body).toContainText('MTJ-EG')

    // Payroll is reported per currency and never summed across them.
    await expect(body).toContainText(/AED\s?[\d,]+/)
    await expect(body).toContainText(/SAR\s?[\d,]+/)
    await expect(body).toContainText(/EGP\s?[\d,]+/)

    // UAE works Mon-Fri; the other two run Sun-Thu. Both patterns must appear.
    await expect(body).toContainText('Mon · Tue · Wed · Thu · Fri')
    await expect(body).toContainText('Sun · Mon · Tue · Wed · Thu')
    health.assertClean()
  })

  test('directory supports search, entity filter, status filter, sort and pagination', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'People')
    await expect(page.getByRole('heading', { name: 'People directory' })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()

    // --- search ---
    await page.getByRole('textbox', { name: 'Search employees' }).fill('Karim')
    await expect(rows).toHaveCount(2)
    await expect(page.locator('tbody')).toContainText('Karim Fouad')
    await expect(page.locator('tbody')).toContainText('Yusuf Karim')
    await page.getByRole('textbox', { name: 'Search employees' }).fill('')
    await expect(rows.first()).toBeVisible()

    // --- entity filter ---
    await page.getByRole('combobox', { name: 'Filter by legal entity' }).selectOption({ label: 'Matajer Saudi Arabia' })
    await expect(rows).toHaveCount(6)
    for (const cell of await page.locator('tbody tr td:nth-child(3)').all()) {
      await expect(cell).toContainText('Matajer Commerce Solutions Company LLC')
    }
    await page.getByRole('combobox', { name: 'Filter by legal entity' }).selectOption({ label: 'All entities' })

    // --- status filter (and the offboarded record hidden by default) ---
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'Probation' })
    await expect(rows).toHaveCount(2)
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'Offboarded' })
    await expect(rows).toHaveCount(1)
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'All statuses' })

    // --- sort: newest first must be strictly descending by joining year ---
    await page.getByRole('combobox', { name: 'Sort employees' }).selectOption({ label: 'Newest' })
    await expect(rows.first()).toBeVisible()
    const joined = await page.locator('tbody tr td:nth-child(4) strong').allInnerTexts()
    const years = joined.map((t) => Number(t.match(/(\d{4})/)?.[1]))
    expect(years.every((y) => Number.isFinite(y)), `Joined column must show the year, got: ${joined.join(', ')}`).toBe(true)
    expect(years, 'newest-first sort must be descending').toEqual([...years].sort((a, b) => b - a))

    // --- pagination ---
    await page.getByRole('combobox', { name: 'Sort employees' }).selectOption({ label: 'Name' })
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled()
    health.assertClean()
  })

  test('employee profile brings the record together, including gated compensation', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'People')
    await page.getByRole('textbox', { name: 'Search employees' }).fill('Al-Dosari')
    // The search box is debounced; wait for the filtered result before clicking,
    // otherwise the click lands on whatever row the unfiltered list showed.
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.locator('tbody tr').first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Position details')
    await expect(dialog).toContainText('Data Analyst')
    // Linked to a legal entity, in that entity's currency.
    await expect(dialog).toContainText('Matajer Saudi Arabia')
    await expect(dialog).toContainText(/SAR\s?[\d,]+/)
    // Employment facts required by the brief.
    await expect(dialog).toContainText('Start date')
    await expect(dialog).toContainText('Contract')
    await expect(dialog).toContainText('Probation ends')
    await expect(dialog).toContainText('Current balances')
    health.assertClean()
  })

  test('creating an employee persists and the record appears in the directory', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'People')

    const stamp = Date.now().toString().slice(-6)
    const lastName = `Testerson${stamp}`

    await page.getByRole('button', { name: 'Add employee' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('textbox', { name: 'First name' }).fill('Ava')
    await dialog.getByRole('textbox', { name: 'Last name' }).fill(lastName)
    await dialog.getByRole('textbox', { name: 'Work email' }).fill(`ava.${stamp}@matajer.demo`)
    await dialog.getByRole('textbox', { name: 'Job title' }).fill('Implementation Consultant')
    await dialog.getByRole('combobox', { name: 'Legal entity' }).selectOption({ label: 'Matajer Retail Technologies FZ-LLC' })
    // No login: keeps the flow deterministic (creating one shows a one-time
    // password panel instead of closing the dialog).
    await dialog.getByRole('combobox', { name: 'Login account' }).selectOption({ label: 'No login for now' })
    await dialog.getByRole('button', { name: 'Add employee' }).click()

    await expect(dialog).toBeHidden({ timeout: 20_000 })

    // Persisted: find it by a fresh server-side search.
    await page.getByRole('textbox', { name: 'Search employees' }).fill(lastName)
    await expect(page.locator('tbody')).toContainText(lastName)
    await expect(page.locator('tbody')).toContainText('Implementation Consultant')

    // Still there after a full reload - proves the database, not React state.
    await page.reload()
    await gotoPage(page, 'People')
    await page.getByRole('textbox', { name: 'Search employees' }).fill(lastName)
    await expect(page.locator('tbody')).toContainText(lastName)
    health.assertClean()
  })

  test('editing an employee persists and writes a timeline event', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'People')
    await page.getByRole('textbox', { name: 'Search employees' }).fill('Nasser')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.locator('tbody tr').first().click()

    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Edit profile' }).click()
    await dialog.getByRole('textbox', { name: 'Job title' }).fill('Staff Frontend Engineer')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toContainText('Staff Frontend Engineer', { timeout: 20_000 })

    // Reload and confirm the change survived.
    await page.reload()
    await gotoPage(page, 'People')
    await page.getByRole('textbox', { name: 'Search employees' }).fill('Nasser')
    await expect(page.locator('tbody')).toContainText('Staff Frontend Engineer')
    health.assertClean()
  })

  test('sign out returns to the login screen and clears the session', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await signOut(page)
    await page.reload()
    // A reload must not restore the workspace.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })
})

test.describe('Regressions from the production acceptance report', () => {
  test('EMS-001: editing one field must not overwrite work mode', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await gotoPage(page, 'People')
    await page.getByRole('textbox', { name: 'Search employees' }).fill('Al-Dosari')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.locator('tbody tr').first().click()

    const dialog = page.getByRole('dialog')
    // The record is REMOTE in the seed; the form must show that, not a default.
    await expect(dialog).toContainText('Remote')

    await dialog.getByRole('button', { name: 'Edit profile' }).click()
    await expect(dialog.getByRole('combobox', { name: 'Work mode' })).toHaveValue('REMOTE')
    // Every editable field must arrive populated, not blank.
    await expect(dialog.getByRole('textbox', { name: 'Work email' })).not.toHaveValue('')

    // Change one unrelated field and save.
    await dialog.getByRole('textbox', { name: 'Job title' }).fill('Data Analyst II')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toContainText('Data Analyst II', { timeout: 20_000 })

    // Work mode must survive untouched.
    const after = await apiAs(page, '/employees?q=Al-Dosari')
    expect(after.body.data[0].workMode, 'an unrelated edit must not change work mode').toBe('REMOTE')

    // Restore.
    await apiAs(page, `/employees/${after.body.data[0].id}`, { method: 'PATCH', body: { jobTitle: 'Data Analyst' } })
  })

  test('EMS-006: entity headcounts agree with the directory total', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)

    const entities = await apiAs(page, '/legal-entities')
    const summed = entities.body.data.reduce((total, e) => total + (e.headcount ?? 0), 0)

    const directory = await apiAs(page, '/employees?pageSize=1')
    const directoryTotal = directory.body.meta.total

    expect(summed, 'entity cards must not count offboarded people when the directory does not').toBe(directoryTotal)
  })
})
