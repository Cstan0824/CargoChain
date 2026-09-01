import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Phase 9 milestone composer structure', () => {
  it('uses connector insertion controls and keeps drag-and-drop reordering', () => {
    const page = source('./ProposeMilestones.jsx');
    const styles = source('./ProposeMilestones.module.css');

    expect(page).not.toContain('styles.addBtn');
    expect(page.match(/<TimelineConnector/g)).toHaveLength(3);
    expect(page).toContain("label={milestones.length > 0 ? 'Add checkpoint before milestone 1'");
    expect(page).toContain('label={`Add checkpoint after milestone ${i + 1}`}');
    expect(page).toContain('insertMilestone(i + 1)');
    expect(page).toContain('pendingFocusMilestoneIdRef');
    expect(styles).toContain('min-height: 44px;');
    expect(styles).toContain('scale(0.96)');
  });

  it('keeps the milestone header concise and uses a decorative checkpoint icon', () => {
    const page = source('./ProposeMilestones.jsx');
    const styles = source('./ProposeMilestones.module.css');

    expect(page).toContain('HiOutlineFlag');
    expect(page).toContain('className={styles.headerIcon} aria-hidden="true"');
    expect(styles).toContain('font-size: var(--fs-lg);');
  });
});
