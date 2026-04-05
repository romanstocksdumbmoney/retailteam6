const categoryKeywords = {
  Meals: ['restaurant', 'cafe', 'coffee', 'food', 'diner', 'pizza', 'burger'],
  Travel: ['airlines', 'flight', 'hotel', 'airbnb', 'booking', 'resort'],
  Transportation: ['uber', 'lyft', 'taxi', 'transit', 'train', 'bus', 'metro'],
  Fuel: ['fuel', 'gas', 'shell', 'chevron', 'bp', 'exxon'],
  Office: ['staples', 'office depot', 'printer', 'paper', 'stationery'],
  Software: ['github', 'microsoft', 'google', 'aws', 'azure', 'notion', 'slack'],
  Utilities: ['electric', 'water', 'internet', 'mobile', 'phone', 'utility'],
  Healthcare: ['pharmacy', 'clinic', 'hospital', 'medical', 'health'],
  Entertainment: ['movie', 'cinema', 'theater', 'spotify', 'netflix'],
};

function getSupportedCategories() {
  return [...Object.keys(categoryKeywords), 'Other'];
}

function categorizeExpense({ vendor, rawText }) {
  const searchable = `${vendor || ''} ${rawText || ''}`.toLowerCase();

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const matchedKeyword = keywords.find((keyword) => searchable.includes(keyword));
    if (matchedKeyword) {
      return { category, matchedKeyword };
    }
  }

  return { category: 'Other', matchedKeyword: null };
}

module.exports = {
  categorizeExpense,
  getSupportedCategories,
};
