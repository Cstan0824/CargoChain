export function countWords(value = '') {
  const normalized = String(value).trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function utf8Length(value = '') {
  return new TextEncoder().encode(String(value)).length;
}

export function exceedsTextLimit(value, maxWords, maxBytes) {
  return countWords(value) > maxWords || utf8Length(value) > maxBytes;
}
