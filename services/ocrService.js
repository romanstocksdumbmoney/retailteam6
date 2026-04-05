const Tesseract = require('tesseract.js');

async function extractReceiptText(imagePath) {
  const result = await Tesseract.recognize(imagePath, 'eng');

  return {
    text: result?.data?.text || '',
    confidence: result?.data?.confidence || 0,
  };
}

module.exports = {
  extractReceiptText,
};
