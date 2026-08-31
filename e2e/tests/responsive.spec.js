import { test, expect } from '@playwright/test'
import { ACCOUNTS, gotoPage, signIn, trackPageHealth } from '../helpers.js'

/**
 * Runs in the `mobile` project at 390x844. The brief requires a responsive,
 * mobile-friendly experience, so the assertion that matters is that nothing
 * overflows the viewport horizontally and the navigation is still reachable.
 */
async function expectNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`),
  }))
  expect(
    overflow.scrollW,
    `${label} overflows horizontally (${overflow.scrollW} > ${overflow.clientW}); offenders: ${overflow.offenders.join(', ')}`,
  ).toBeLessThanOrEqual(overflow.clientW + 1)
}

test.describe('Mobile layout', () => {
  test('employee pages fit the viewport and the drawer navigation works', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.employee)

    // The sidebar is collapsed behind a labelled control at this width.
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()

    for (const label of ['Home', 'My profile', 'My requests']) {
      await gotoPage(page, label)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page, `employee ${label}`)
    }
    health.assertClean()
  })

  test('admin pages fit the viewport, including the directory', async ({ page }) => {
    const health = trackPageHealth(page)
    await signIn(page, ACCOUNTS.admin)

    for (const label of ['Overview', 'People', 'Requests', 'Legal entities']) {
      await gotoPage(page, label)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page, `admin ${label}`)
    }
    health.assertClean()
  })

  test('the leave request modal is usable and closable on a phone', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee)
    await page.getByRole('button', { name: 'Request leave' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectNoHorizontalOverflow(page, 'leave modal')

    // There must always be a way out of a modal.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
  })
})
