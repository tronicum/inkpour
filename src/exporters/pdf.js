/**
 * exporters/pdf.js
 * PDF export — delegates to browser capability layer.
 * Never calls browser.tabs directly.
 */

import { getCapabilities } from '../browser/index.js';

export async function exportPDF(markdown, filename) {
  const { exportPDF: browserExportPDF } = getCapabilities();
  return browserExportPDF(markdown, filename);
}
