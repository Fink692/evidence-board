import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('mobile and tablet Inspector contains keyboard focus and returns it to the invoking card', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/?guest=1');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Research overview' })).toHaveCount(0);
    const revision = await page.locator('.revision-tag').textContent();
    const invoker = page.locator('.eb-list-claim[data-node-id="claim_pilot"]');
    await invoker.focus();
    await page.keyboard.press('Enter');

    const drawer = page.locator('dialog.inspector-dialog');
    const close = drawer.getByRole('button', { name: 'Close inspector', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAccessibleName('Start with a measured pilot, not a blanket rollout.');
    await expect(close).toBeFocused();
    expect(await close.evaluate(button => {
      const rect = button.getBoundingClientRect();
      const visible = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return visible === button || button.contains(visible);
    })).toBe(true);

    for (let step = 0; step < 18; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.inspector-dialog[open]')))).toBe(true);
    }
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.inspector-dialog[open]')))).toBe(true);

    // Navigation inside the drawer must retain the original board invoker.
    await drawer.locator('.relation-main').first().click();
    await expect(drawer).toHaveAccessibleName('55.8% less time on one bounded programming task.');
    await expect(close).toBeFocused();
    const audit = await new AxeBuilder({ page }).include('dialog.inspector-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);

    // Existing edit dialogs can still sit above the drawer and return focus to it.
    const edit = drawer.getByRole('button', { name: 'Edit', exact: true });
    await edit.click();
    const editor = page.getByRole('dialog', { name: 'Edit evidence', exact: true });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(edit).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(invoker).toBeFocused();

    if (viewport.width === 820) {
      await page.keyboard.press('Enter');
      await expect(close).toBeFocused();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.getByRole('complementary', { name: 'Claim inspector' })).toBeVisible();
      await expect(page.locator('dialog.inspector-dialog[open]')).toHaveCount(0);
      await expect(invoker).toHaveAttribute('aria-pressed', 'true');
      await page.setViewportSize(viewport);
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(invoker).toBeFocused();
    }
    await expect(page.locator('.eb-list')).toBeVisible();
    await expect(page.locator('.revision-tag')).toHaveText(revision!);

    await page.keyboard.press('Enter');
    await expect(close).toBeFocused();
    await close.click();
    await expect(drawer).not.toBeVisible();
    await expect(invoker).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('the measured map moves to the evidence selected by the shared focus control', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?guest=1');
  await expect(page.locator('.eb-map')).toHaveAttribute('data-map-ready', 'true');
  await expect(page.getByRole('complementary', { name: 'Research overview' })).toBeVisible();
  const viewport = page.locator('.react-flow__viewport');
  const initial = await viewport.getAttribute('style');
  await page.getByRole('button', { name: 'Take a closer look', exact: true }).click();
  await expect(page.locator('.eb-map-node.is-focused .eb-map-card[data-node-id="evidence_trust"]')).toBeVisible();
  await expect.poll(() => viewport.getAttribute('style')).not.toBe(initial);
  const zoom = Number.parseInt((await page.locator('.eb-map-zoom').textContent())!, 10);
  expect(zoom).toBeGreaterThanOrEqual(72);
  expect(zoom).toBeLessThanOrEqual(112);
  await expect(page.getByRole('complementary', { name: 'Evidence inspector' })).toContainText('Developers reported more distrust than trust.');
});

test('mobile navigation keeps keyboard focus visible, supports nested dialogs, and cleans up on resize', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?guest=1');
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    const drawer = page.locator('dialog.mobile-navigation-dialog');
    const close = drawer.getByRole('button', { name: 'Close navigation', exact: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAccessibleName('Workspace navigation');
    await expect(close).toBeFocused();
    expect(await drawer.evaluate(element => element.matches(':modal'))).toBe(true);

    for (let step = 0; step < 24; step++) {
      expect(await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !active.closest('dialog.mobile-navigation-dialog[open]')) return false;
        const bounds = active.getBoundingClientRect();
        const top = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return active === top || active.contains(top);
      })).toBe(true);
      await page.keyboard.press('Tab');
    }
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    const settingsButton = drawer.getByRole('button', { name: 'Workspace settings', exact: true });
    await expect(settingsButton).toBeFocused();
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Your workspace, your record.', exact: true });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).not.toBeVisible();
    await expect(settingsButton).toBeFocused();
    await expect(drawer).toBeVisible();
    const audit = await new AxeBuilder({ page }).include('dialog.mobile-navigation-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(menu).toBeFocused();
    await expect(page.locator('.eb-list')).toBeVisible();
    await page.keyboard.press('Enter');
    await drawer.getByRole('button', { name: 'Source library', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(drawer).not.toBeVisible();
    await expect(page.locator('.sources-view')).toBeVisible();
    await expect(menu).toBeFocused();

    await page.keyboard.press('Enter');
    await close.click();
    await expect(menu).toBeFocused();
    await page.keyboard.press('Enter');
    await page.mouse.click(width - 5, 80);
    await expect(drawer).not.toBeVisible();
    await expect(menu).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(close).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 900 });
    const desktop = page.getByRole('complementary', { name: 'Workspace navigation', exact: true });
    await expect(desktop).toBeVisible();
    await expect(page.locator('dialog.mobile-navigation-dialog[open]')).toHaveCount(0);
    await expect(desktop.getByRole('button', { name: 'Source library', exact: true })).toBeFocused();
    await page.setViewportSize({ width, height: 844 });
    await expect(menu).toBeVisible();
    await expect(drawer).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
