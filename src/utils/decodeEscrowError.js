import reasons from './escrowErrors.json';

export function decodeEscrowError(error) {
  const seen = new Set();
  function visit(value) {
    if (typeof value === 'string') {
      for (const selector of value.match(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/g) || []) {
        if (reasons[selector.toLowerCase()]) return reasons[selector.toLowerCase()];
      }
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const child of [value.message, ...Object.values(value)]) {
        const reason = visit(child);
        if (reason) return reason;
      }
    }
    return null;
  }
  return visit(error);
}
