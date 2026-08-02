import { describe, expect, it } from 'vitest';
import { countWords, exceedsTextLimit, utf8Length } from './textLimits.js';

describe('text limits', () => {
  it('counts user-facing words across repeated whitespace', () => {
    expect(countWords('  change   the\nshipment deadline  ')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });

  it('retains the contract byte guard without exposing it as the UI counter', () => {
    expect(utf8Length('é')).toBe(2);
    expect(exceedsTextLimit('one two three', 2, 500)).toBe(true);
    expect(exceedsTextLimit('é'.repeat(33), 8, 64)).toBe(true);
  });
});
