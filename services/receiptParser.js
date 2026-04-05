const totalMatchers = [
  /(?:grand\s+)?total(?:\s+due)?[^\d]{0,12}(\d{1,6}(?:[.,]\d{2}))/i,
  /amount\s+due[^\d]{0,12}(\d{1,6}(?:[.,]\d{2}))/i,
  /balance[^\d]{0,12}(\d{1,6}(?:[.,]\d{2}))/i,
];

const dateMatchers = [
  /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
  /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/,
];

function normalizeAmount(rawAmount) {
  if (!rawAmount) return null;
  const normalized = rawAmount.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function extractTotal(text) {
  for (const matcher of totalMatchers) {
    const match = text.match(matcher);
    if (match?.[1]) {
      const value = normalizeAmount(match[1]);
      if (value !== null) {
        return value;
      }
    }
  }

  const currencyCandidates = [
    ...text.matchAll(/\b\d{1,6}(?:[.,]\d{2})\b/g),
  ].map((match) => normalizeAmount(match[0])).filter((value) => value !== null);

  if (currencyCandidates.length === 0) return null;
  return Math.max(...currencyCandidates);
}

function extractVendor(text) {
  const lines = text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  for (const line of lines.slice(0, 8)) {
    const lowered = line.toLowerCase();
    if (
      !/\d/.test(line) &&
      !lowered.includes('receipt') &&
      !lowered.includes('total') &&
      !lowered.includes('invoice')
    ) {
      return line;
    }
  }

  return lines[0] || 'Unknown vendor';
}

function toIsoDate(rawDate) {
  const directDate = new Date(rawDate);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString().slice(0, 10);
  }

  const parts = rawDate.split(/[/-]/).map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  let month;
  let day;
  let year;
  if (rawDate.includes('-') && rawDate.indexOf('-') === 4) {
    [year, month, day] = parts;
  } else if (parts[0] > 12) {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  if (year < 100) {
    year += 2000;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate.toISOString().slice(0, 10);
}

function extractDate(text) {
  for (const matcher of dateMatchers) {
    const match = text.match(matcher);
    if (match?.[1]) {
      const parsed = toIsoDate(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

function parseReceiptText(text) {
  const normalizedText = (text || '').replace(/\r/g, '\n');
  return {
    vendor: extractVendor(normalizedText),
    total: extractTotal(normalizedText),
    expenseDate: extractDate(normalizedText),
    rawText: normalizedText,
  };
}

module.exports = {
  parseReceiptText,
};
