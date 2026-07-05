/**
 * browser/safari.js
 * Safari / cross-browser fallback capability implementations.
 * Uses jsPDF for PDF export (no native printToPDF API).
 */

export const safariCapabilities = {

  async exportPDF(markdown, filename) {
    // TODO: implement via jsPDF
    // import jsPDF dynamically or bundle it
    throw new Error('Safari PDF export not yet implemented');
  },

};
