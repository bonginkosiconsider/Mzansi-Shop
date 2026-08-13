export const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const aLen = a.length;
  const bLen = b.length;
  const prev = new Array(bLen + 1).fill(0);
  const curr = new Array(bLen + 1).fill(0);

  for (let j = 0; j <= bLen; j += 1) prev[j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;
    const aChar = a[i - 1];
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j += 1) prev[j] = curr[j];
  }

  return prev[bLen];
};

const getMatchScore = (haystack, needle) => {
  if (!haystack || !needle) return 0;
  if (haystack.includes(needle)) return needle.length >= 4 ? 5 : 4;

  const words = haystack.split(' ');
  if (words.some((word) => word.startsWith(needle))) return 3;

  if (needle.length >= 3) {
    const maxDistance = needle.length <= 4 ? 1 : 2;
    if (words.some((word) => levenshtein(word, needle) <= maxDistance)) return 2;
  }

  return 0;
};

export const scoreItem = (item, needle) => {
  if (!needle) return 0;
  const terms = needle.split(' ').filter(Boolean);
  const fields = [
    item.name,
    item.description,
    item.shortDescription,
    Array.isArray(item.categories) ? item.categories.join(' ') : '',
    Array.isArray(item.tags) ? item.tags.join(' ') : ''
  ].map(normalizeText);

  let total = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    let termScore = 0;
    for (const field of fields) {
      termScore = Math.max(termScore, getMatchScore(field, term));
    }
    if (termScore > 0) {
      matchedTerms += 1;
      total += termScore;
    }
  }

  if (matchedTerms === 0) return 0;
  return total + matchedTerms;
};
