// src/components/Table.jsx — CargoChain
// Declarative table with sticky header. Cells are plain nodes so the
// caller can drop Badges, icons, links, etc. in them.

import styles from './Table.module.css';
import { Skeleton } from './Skeleton.jsx';

export function Table({
  columns,
  rows,
  emptyMessage = 'No rows yet.',
  onRowClick,
  loading = false,
  loadingRows = 4,
  loadingLabel = 'Loading table…',
}) {
  return (
    <div className={styles.wrap} aria-busy={loading || undefined}>
      {loading && <span className="visually-hidden" role="status">{loadingLabel}</span>}
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={col.align ? styles[`align_${col.align}`] : ''}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className={styles.skeletonRow} aria-hidden="true">
                {columns.map((column) => {
                  const skeleton = column.skeleton || {};
                  return (
                    <td key={column.key} className={column.align ? styles[`align_${column.align}`] : ''}>
                      <Skeleton
                        variant={skeleton.variant || 'text'}
                        width={skeleton.width || '72%'}
                        height={skeleton.height}
                      />
                    </td>
                  );
                })}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={onRowClick ? styles.clickableRow : ''}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={col.align ? styles[`align_${col.align}`] : ''}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
