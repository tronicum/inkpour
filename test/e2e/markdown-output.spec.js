/**
 * test/e2e/markdown-output.spec.js
 * Validates Markdown output quality using tests/gemini-output.md as a
 * ground-truth reference fixture (hand-cleaned to represent ideal output).
 *
 * These tests don't need a browser extension — they parse the MD file
 * directly and assert structural correctness.
 */

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const MD = fs.readFileSync(
  path.resolve(__dirname, '../../tests/gemini-output.md'), 'utf8'
);

test.describe('gemini-output.md — structural checks', () => {
  test('has a top-level title heading', () => {
    expect(MD).toMatch(/^# .+/m);
  });

  test('has export metadata blockquote', () => {
    expect(MD).toContain('> Exported from');
    expect(MD).toContain('gemini.google.com');
  });

  test('contains user turn (## You)', () => {
    expect(MD).toMatch(/^## You$/m);
  });

  test('contains assistant turn (## Gemini)', () => {
    expect(MD).toMatch(/^## Gemini$/m);
  });

  test('does not contain "You said" UI label', () => {
    // Regression guard: extractor should strip Gemini UI labels
    expect(MD.toLowerCase()).not.toContain('you said');
  });

  test('does not contain "Gemini said" UI label', () => {
    expect(MD.toLowerCase()).not.toContain('gemini said');
  });

  test('preserves bold formatting', () => {
    expect(MD).toContain('**bold text**');
  });

  test('preserves italic formatting', () => {
    expect(MD).toContain('*italicized text*');
  });

  test('preserves combined bold+italic', () => {
    expect(MD).toContain('***combined bold and italic text***');
  });

  test('preserves strikethrough', () => {
    expect(MD).toContain('~~strikethrough text~~');
  });

  test('preserves inline code', () => {
    expect(MD).toContain('`inline code blocks`');
  });

  test('has a fenced code block with language tag', () => {
    // Should have typescript language tag (not a bare ```)
    expect(MD).toContain('```typescript');
  });

  test('code block is properly closed', () => {
    const opens  = (MD.match(/^```\w*/gm) ?? []).length;
    const closes = (MD.match(/^```$/gm) ?? []).length;
    expect(opens).toEqual(closes);
  });

  test('preserves table structure', () => {
    expect(MD).toContain('| Feature Name');
    expect(MD).toContain('| --- |');
  });

  test('preserves unordered list items', () => {
    expect(MD).toMatch(/^\* /m);
  });

  test('does not contain raw HTML tags', () => {
    expect(MD).not.toMatch(/<(div|span|p|ul|li|strong|em)\b/i);
  });

  test('has horizontal rule separators between turns', () => {
    const hrs = MD.match(/^---$/gm) ?? [];
    expect(hrs.length).toBeGreaterThanOrEqual(2);
  });

  test('preserves emojis', () => {
    expect(MD).toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  test('does not end with an empty code block', () => {
    // Regression: early Gemini exports had a stray ``` at the end
    expect(MD.trimEnd()).not.toMatch(/^```\s*$/m.source + '$');
    const trimmed = MD.trimEnd();
    expect(trimmed.endsWith('```')).toBe(false);
  });
});
