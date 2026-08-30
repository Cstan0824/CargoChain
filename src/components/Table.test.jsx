import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table.jsx';

const columns = [
  { key: 'id', header: 'ID', skeleton: { width: 44 } },
  { key: 'route', header: 'Route', skeleton: { width: '70%' } },
  { key: 'status', header: 'Status', skeleton: { variant: 'block', width: 64, height: 24 } },
];

describe('Table loading state', () => {
  it('keeps real headers and renders geometry-matched rows while loading', () => {
    const { container } = render(<Table columns={columns} rows={[]} loading loadingRows={3} loadingLabel="Loading shipments…" />);

    expect(screen.getByRole('status').textContent).toBe('Loading shipments…');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(screen.getByRole('table').closest('[aria-busy="true"]')).toBeTruthy();
  });
});
