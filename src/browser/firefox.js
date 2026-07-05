/**
 * browser/firefox.js
 * Firefox-specific capability implementations.
 */

export const firefoxCapabilities = {

  async exportPDF(markdown, filename) {
    // Open the markdown as a styled HTML page in a new tab,
    // then use Firefox's native printToPDF to save it silently.
    // TODO: implement — requires tabs permission + printToPDF API
    throw new Error('Firefox PDF export not yet implemented');
  },

};
