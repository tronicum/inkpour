/**
 * test/e2e/popup.spec.js
 * Tests the popup UI — buttons, labels, settings gear.
 * Chromium only — see playwright.config.js for why the old `firefox` project
 * was removed (Playwright can't drive moz-extension:// pages at all).
 */

const { test, expect } = require('../helpers/extension');

test.describe('Popup UI', () => {
  // The old always-visible ~11-button grid (TODOs.md "Popup layout" item)
  // went through two redesigns: first a single instant-fire split button,
  // then — per live usage feedback — a picker + separate "Export" button,
  // plus Copy MD/ZIP promoted back out to always-visible quick buttons.
  // Picking a row in the menu only changes the selection; nothing runs
  // until Export is clicked. This matters most for Gist/Notion, where
  // instant-fire on selection left no chance to back out of an upload.

  test('Copy MD and ZIP quick buttons, and the picker + Export button, are visible by default', async ({ popupPage }) => {
    await expect(popupPage.locator('#copyBtn')).toBeVisible();
    await expect(popupPage.locator('#zipBtn')).toBeVisible();
    await expect(popupPage.locator('#exportSelectBtn')).toBeVisible();
    await expect(popupPage.locator('#exportGoBtn')).toBeVisible();
    // Fresh profile, nothing exported yet — falls back to the Settings
    // default format ('md'), whose menu-item label is "MD".
    await expect(popupPage.locator('#exportSelectedLabel')).toHaveText('MD');
  });

  test('the old always-visible button grid is gone', async ({ popupPage }) => {
    await expect(popupPage.locator('.export-label')).toHaveCount(0);
    await expect(popupPage.locator('.all-group')).toHaveCount(0);
  });

  test('the real export buttons are hidden — only reachable via the Export button proxy', async ({ popupPage }) => {
    await expect(popupPage.locator('#realExportActions')).toBeHidden();
    await expect(popupPage.locator('#mdBtn')).toBeHidden();
    await expect(popupPage.locator('#pdfBtn')).toBeHidden();
    await expect(popupPage.locator('#gistBtn')).toBeHidden();
    await expect(popupPage.locator('#notionBtn')).toBeHidden();
  });

  test('selector opens a menu with every picker format, correctly labelled', async ({ popupPage }) => {
    await expect(popupPage.locator('#exportMenu')).toBeHidden();
    await popupPage.click('#exportSelectBtn');
    await expect(popupPage.locator('#exportMenu')).toBeVisible();
    await expect(popupPage.locator('#exportSelectBtn')).toHaveAttribute('aria-expanded', 'true');

    await expect(popupPage.locator('.export-menu-item[data-format="md"]')).toHaveText(/MD/);
    await expect(popupPage.locator('.export-menu-item[data-format="pdf"]')).toHaveText(/PDF/);
    await expect(popupPage.locator('.export-menu-item[data-format="html"]')).toHaveText(/HTML/);
    await expect(popupPage.locator('.export-menu-item[data-format="json"]')).toHaveText(/JSON/);
    await expect(popupPage.locator('.export-menu-item[data-format="docx"]')).toHaveText(/DOCX/);
    // Gist/Notion rows stay hidden inside the menu too, same gating as
    // before — no GitHub/Notion token configured in a fresh test profile.
    await expect(popupPage.locator('#gistMenuOption')).toBeHidden();
    await expect(popupPage.locator('#notionMenuOption')).toBeHidden();
  });

  test('clicking outside the menu closes it', async ({ popupPage }) => {
    await popupPage.click('#exportSelectBtn');
    await expect(popupPage.locator('#exportMenu')).toBeVisible();
    await popupPage.click('#platformIndicator');
    await expect(popupPage.locator('#exportMenu')).toBeHidden();
  });

  test('Escape key closes the menu', async ({ popupPage }) => {
    await popupPage.click('#exportSelectBtn');
    await expect(popupPage.locator('#exportMenu')).toBeVisible();
    await popupPage.keyboard.press('Escape');
    await expect(popupPage.locator('#exportMenu')).toBeHidden();
  });

  test('picking a menu item updates the selector label and closes the menu, without firing the export', async ({ popupPage }) => {
    await popupPage.click('#exportSelectBtn');
    await popupPage.click('.export-menu-item[data-format="pdf"]');
    await expect(popupPage.locator('#exportMenu')).toBeHidden();
    await expect(popupPage.locator('#exportSelectedLabel')).toHaveText('PDF');
    // No status message yet — selecting a format must not have run anything.
    await expect(popupPage.locator('#status')).toHaveText('');
  });

  test('pressing Export after picking a format is what actually fires it', async ({ popupPage }) => {
    await popupPage.click('#exportSelectBtn');
    await popupPage.click('.export-menu-item[data-format="pdf"]');
    await expect(popupPage.locator('#status')).toHaveText('');
    await popupPage.click('#exportGoBtn');
    // Blank test context — no chat page open — so this should now show an
    // error status, proving the click actually reached the real pdfBtn.
    await expect(popupPage.locator('#status')).toHaveClass(/error/, { timeout: 5000 });
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
    // Clicking Export on a blank context should show an error status.
    // Selector defaults to 'md' in a fresh profile, same action the old
    // test triggered by clicking #mdBtn directly.
    await popupPage.click('#exportGoBtn');
    await expect(popupPage.locator('#status')).toHaveClass(/error/, { timeout: 5000 });
    const msg = await popupPage.locator('#status').textContent();
    expect(msg.length).toBeGreaterThan(0);
  });

  test('Export button is disabled during export', async ({ popupPage }) => {
    await popupPage.click('#exportGoBtn');
    // Immediately check — button should be disabled while working (mirrors
    // the underlying mdBtn's own loading state, see popup.js's setLoading()).
    await expect(popupPage.locator('#exportGoBtn')).toBeDisabled();
    // Eventually re-enabled after error
    await expect(popupPage.locator('#exportGoBtn')).toBeEnabled({ timeout: 5000 });
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
