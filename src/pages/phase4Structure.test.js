import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Phase 4 responsive structure', () => {
  it('keeps header actions below the title and account workspace/toolbars stack at narrow widths', () => {
    const topbar = source('../components/Topbar.module.css');
    const account = source('./Account.module.css');
    const shipments = source('./MyShipments.module.css');

    expect(topbar).toContain('@media (max-width: 640px)');
    expect(topbar).toContain('grid-template-columns: minmax(0, 1fr) auto auto;');
    expect(topbar).toContain('grid-column: 1 / -1; grid-row: 2;');
    const topbarRoot = topbar.match(/\.topbar \{([\s\S]*?)\n\}/)?.[1] || '';
    expect(topbarRoot).not.toContain('background:');
    expect(topbarRoot).not.toContain('border-radius:');
    expect(topbarRoot).not.toContain('box-shadow:');
    expect(account).toContain('@media (max-width: 680px)');
    expect(account).toContain('.financialGrid { grid-template-columns: 1fr; }');
    expect(account).toContain('.accountWorkspace { grid-template-columns: 1fr; }');
    expect(account).toContain('.networkTag');
    expect(account).toContain('.networkTagDotActive');
    expect(account).not.toContain('.networkIndicator');
    expect(account).not.toContain('.activityToggle');
    expect(shipments).toContain('@media (max-width: 800px)');
    expect(shipments).toContain('.toolbar { flex-direction: column; align-items: stretch; }');
  });

  it('keeps the account earnings surface compact and named controls at 44px', () => {
    const account = source('./Account.module.css');
    const track = source('./Track.module.css');
    const confirmDialog = source('../components/ConfirmDialog.module.css');
    const registrationModal = source('../components/RegistrationModal.module.css');
    const ratingPanel = source('../components/CarrierRatingPanel.module.css');
    const milestones = source('./ProposeMilestones.module.css');

    expect(account).not.toContain('earningsCard');
    expect(track).toContain('.proposalModalClose {\n  width: 44px;\n  height: 44px;');
    expect(track).toContain('.tipInputRow button { min-height: 44px; }');
    expect(confirmDialog).toContain('width: 44px;\n  height: 44px;');
    expect(registrationModal).toContain('width: 44px;\n  height: 44px;');
    expect(ratingPanel).toContain('.actionBar > button { min-height: 44px;');
    expect(milestones).toContain('min-height: 44px;');
  });
});
