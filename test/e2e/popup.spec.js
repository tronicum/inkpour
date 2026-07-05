/**
 * test/e2e/popup.spec.js
 * Tests the popup UI — buttons, labels, settings gear.
 * Runs in both Chrome and Firefox (popup.html is pure HTML, no extension APIs called on load).
 */

const { test, expect } = require('../helpers/extension');

test.describe('Popup UI', () => {
  test('shows all three export buttons', async ({ popupPage }) => {
    await expect(popupPage.locator('#mdBtn')).toBeVisible();
    await expect(popupPage.locator('#pdfBtn')).toBeVisible();
    await expect(popupPage.locator('#htmlBtn')).toBeVisible();
  });

  test('export label reads "Export as"', async ({ popupPage }) => {
    await expect(popupPage.locator('.export-label')).toHaveText('Export as');
  });

  test('buttons are labelled correctly', async ({ popupPage }) => {
    await expect(popupPage.locator('#mdBtn span')).toHaveText('Markdown');
    await expect(popupPage.locator('#pdfBtn span')).toHaveText('PDF');
    await expect(popupPage.locator('#htmlBtn span')).toHaveText('HTML');
  });

  test('settings gear button is visible', async ({ popupPage }) => {
    await expect(popupPage.locator('#settingsBtn')).toBeVisible();
  });

  test('shows supported platform chips', async ({ popupPage }) => {
    const chips = popupPage.locator('.chip');
    await expect(chips).toHaveCount(5);
    const labels = await chips.allTextContents();
    expect(labels).toEqual(['ChatGPT', 'Claude', 'Gemini', 'AI Studio', 'Copilot']);
  });

  test('shows error when no chat page is open', async ({ popupPage }) => {
    // Clicking export on a blank context should show an error status
    await popupPage.click('#mdBtn');
    await expect(popupPage.locator('#status')).toHaveClass(/error/, { timeout: 5000 });
    const msg = await popupPage.locator('#status').textContent();
    expect(msg.length).toBeGreaterThan(0);
  });

  test('buttons are disabled during export', async ({ popupPage }) => {
    await popupPage.click('#mdBtn');
    // Immediately check — button should be disabled while working
    await expect(popupPage.locator('#mdBtn')).toBeDisabled();
    // Eventually re-enabled after error
    await expect(popupPage.locator('#mdBtn')).toBeEnabled({ timeout: 5000 });
  });
});

test.describe('Settings page', () => {
  test('settings page loads and shows browser detection', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/settings.html`);

    await expect(page.locator('#browserName')).not.toHaveText('Detecting…', { timeout: 3000 });
    await expect(page.locator('#browserBadge')).toHaveText('Auto-detected');
  });

  test('settings page has all preference controls', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/settings.html`);

    await expect(page.locator('#defaultFormat')).toBeVisible();
    await expect(page.locator('#filenameTemplate')).toBeVisible();
    await expect(page.locator('#pdfAutoPrint')).toBeVisible();
    await expect(page.locator('#yamlFrontMatter')).toBeVisible();
    await expect(page.locator('#saveBtn')).toBeVisible();
  });

  test('saves and persists preferences', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/settings.html`);

    // Change default format to PDF
    await page.selectOption('#defaultFormat', 'pdf');
    await page.click('#saveBtn');
    await expect(page.locator('#saveStatus')).toHaveText('✓ Saved');

    // Reload and verify it persisted
    await page.reload();
    await expect(page.locator('#defaultFormat')).toHaveValue('pdf');
  });
});
