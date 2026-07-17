/**
 * test/e2e/popup.spec.js
 * Tests the popup UI — buttons, labels, settings gear.
 * Chromium only — see playwright.config.js for why the old `firefox` project
 * was removed (Playwright can't drive moz-extension:// pages at all).
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

  // Batch 8: getConversationList() (src/content.js) returns [] on any
  // unsupported/logged-out page — this is the batch-export feature's
  // feature-detect point, and it must never show up where it can't work.
  // A blank context (same setup as "shows error when no chat page is open"
  // above) is the simplest stand-in for "no history sidebar available".
  test('batch export toggle stays hidden with no chat page open', async ({ popupPage }) => {
    await popupPage.waitForTimeout(500); // let the popup's init IIFEs settle
    await expect(popupPage.locator('#batchExportToggle')).toBeHidden();
    await expect(popupPage.locator('#batch-export-section')).toBeHidden();
  });
});

test.describe('Import from clipboard', () => {
  test('parses pasted text and shows the message count', async ({ popupPage }) => {
    await popupPage.click('#importBtn');
    await expect(popupPage.locator('#import-section')).toBeVisible();

    await popupPage.fill('#importText', [
      'You: What is the capital of France?',
      'ChatGPT: The capital of France is Paris.',
    ].join('\n'));
    await popupPage.fill('#importTitleInput', 'Import history test');
    await popupPage.click('#importSubmitBtn');

    await expect(popupPage.locator('#status')).toHaveClass(/success/, { timeout: 5000 });
    const msg = await popupPage.locator('#status').textContent();
    expect(msg).toContain('2');
  });

  test('lands the imported chat in History immediately, before any export click', async ({ popupPage }) => {
    // Regression test: previously saveLastExport() was only ever called from
    // the export-button handlers, so an import showed "N messages" but wrote
    // nothing to inkpour_history until you separately clicked e.g. Markdown.
    // Clicking Import alone must now be enough.
    await popupPage.evaluate(() => chrome.storage.local.set({ inkpour_history: [] }));

    await popupPage.click('#importBtn');
    await popupPage.fill('#importText', [
      'You: What is the capital of France?',
      'ChatGPT: The capital of France is Paris.',
    ].join('\n'));
    await popupPage.fill('#importTitleInput', 'Import history test');
    await popupPage.click('#importSubmitBtn');

    await expect(popupPage.locator('#status')).toHaveClass(/success/, { timeout: 5000 });

    const history = await popupPage.evaluate(() =>
      chrome.storage.local.get('inkpour_history').then(r => r.inkpour_history ?? [])
    );
    expect(history.length).toBe(1);
    expect(history[0].title).toBe('Import history test');
    expect(history[0].messageCount).toBe(2);
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
