import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('src/App.jsx', 'utf8');

describe('canonical Account routing', () => {
  it('registers Account and preserves Profile/Funds compatibility redirects', () => {
    expect(appSource).toContain('path="/account" element={<Account />}');
    expect(appSource).toContain('path="/profile" element={<Navigate to="/account" replace />}');
    expect(appSource).toContain('path="/funds" element={<Navigate to="/account" replace />}');
  });
});
