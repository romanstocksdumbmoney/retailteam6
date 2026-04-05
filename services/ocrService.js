const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
const Tesseract = require('tesseract.js');

const execFileAsync = promisify(execFile);

async function recognizeText(filePath) {
  const result = await Tesseract.recognize(filePath, 'eng');
  return {
    text: result?.data?.text || '',
    confidence: result?.data?.confidence || 0,
  };
}

async function extractReceiptTextFromImage(imagePath) {
  return recognizeText(imagePath);
}

async function extractFrameFromVideo(videoPath, outputDirectory) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputFramePath = path.join(outputDirectory, `receipt-frame-${randomUUID()}.jpg`);

  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      '00:00:01',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      outputFramePath,
    ]);
  } catch (_error) {
    // Some short videos can fail with seek. Retry from first frame.
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      outputFramePath,
    ]);
  }

  return outputFramePath;
}

async function extractReceiptTextFromVideo(videoPath, tempDirectory) {
  const framePath = await extractFrameFromVideo(videoPath, tempDirectory);
  try {
    const recognized = await recognizeText(framePath);
    return { ...recognized, framePath };
  } finally {
    try {
      await fs.unlink(framePath);
    } catch (_error) {
      // Best-effort cleanup for extracted temp frame.
    }
  }
}

module.exports = {
  extractReceiptTextFromImage,
  extractReceiptTextFromVideo,
};
