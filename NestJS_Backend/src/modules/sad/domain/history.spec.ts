import { describe, expect, it } from 'vitest';
import { versionHistory } from './history.js';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 25, 1, minute));

describe('the Version Control rows of a version', () => {
  it('starts with the draft, ends with the approval, and keeps each event between them in date order', () => {
    const rows = versionHistory({ by: 'Ada', at: at(0) }, [
      { action: 'submitted', actor: 'Ada', step: 'Application manager', comment: null, at: at(1) },
      { action: 'cancelled', actor: 'Ada', step: 'Application manager', comment: null, at: at(2) },
      { action: 'submitted', actor: 'Ada', step: 'Application manager', comment: null, at: at(3) },
      { action: 'info_requested', actor: 'Max', step: 'Application manager', comment: 'Which region?', at: at(4) },
      { action: 'answered', actor: 'Ada', step: 'Application manager', comment: 'Malaysia West', at: at(5) },
      { action: 'approved', actor: 'Max', step: 'Application manager', comment: null, at: at(6) },
      { action: 'returned', actor: 'Sam', step: 'Solution architect', comment: 'Add the DR test date', at: at(7) },
      { action: 'resubmitted', actor: 'Ada', step: 'Solution architect', comment: null, at: at(8) },
    ], at(9));
    expect(rows.map((row) => [row.action, row.user, row.step, row.comment])).toEqual([
      ['started', 'Ada', null, null],
      ['submitted', 'Ada', null, null],
      ['withdrawn', 'Ada', null, null],
      ['submitted', 'Ada', null, null],
      ['info_requested', 'Max', 'Application manager', 'Which region?'],
      ['answered', 'Ada', 'Application manager', 'Malaysia West'],
      ['approved', 'Max', 'Application manager', null],
      ['returned', 'Sam', 'Solution architect', 'Add the DR test date'],
      ['resubmitted', 'Ada', null, null],
      ['version_approved', null, null, null],
    ]);
  });

  it('puts events of approvals in date order whatever order they come in, and has no approval row before approval', () => {
    const rows = versionHistory({ by: 'Ada', at: at(0) }, [
      { action: 'approved', actor: 'Max', step: 'Application manager', comment: null, at: at(5) },
      { action: 'submitted', actor: 'Ada', step: 'Application manager', comment: null, at: at(1) },
    ], null);
    expect(rows.map((row) => [row.action, row.at])).toEqual([
      ['started', at(0)],
      ['submitted', at(1)],
      ['approved', at(5)],
    ]);
  });
});
