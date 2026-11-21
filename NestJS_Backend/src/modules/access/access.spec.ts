import { describe, expect, it } from 'vitest';
import { canViewClass, maskClassified, type VisibilityContext } from './data-visibility.js';
import {
  ALL_PERMISSION_CODES,
  definePermissions,
  isPermissionCode,
  PERMISSION_CATALOGUE,
} from './permission-catalogue.js';
import { NO_DATA_ACCESS, Principal, type Grant } from './principal.js';

const PORTFOLIO_A = '11111111-1111-4111-8111-111111111111';
const PORTFOLIO_B = '22222222-2222-4222-8222-222222222222';
const STREAM_A1 = '33333333-3333-4333-8333-333333333333';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function grant(partial: Partial<Grant>): Grant {
  return {
    roleCode: 'test',
    permissions: new Set(),
    scope: { scopeType: 'global', scopeId: null },
    dataAccess: NO_DATA_ACCESS,
    ...partial,
  };
}

function principal(grants: Grant[], options: { isExternal?: boolean; isSystemAdmin?: boolean } = {}) {
  return new Principal(
    { id: ME, username: 'me@aia.com', email: 'me@aia.com', firstName: 'Me', lastName: 'User', isExternal: options.isExternal ?? false },
    grants,
    { method: 'api-key', apiKeyId: 'k1' },
    options.isSystemAdmin ?? false,
  );
}

describe('permission catalogue', () => {
  it('accepts well-formed module:resource:action codes', () => {
    expect(definePermissions({ 'trm:application:read': 'View applications' })).toEqual({
      'trm:application:read': 'View applications',
    });
  });

  it.each(['trm:application', 'TRM:app:read', 'trm:app:fly', 'trm::read', 'trm:app:read:extra'])(
    'rejects the malformed code %s',
    (code) => {
      expect(() => definePermissions({ [code]: 'x' })).toThrow(/Invalid permission code/);
    },
  );

  it('rejects a permission without a description', () => {
    expect(() => definePermissions({ 'trm:application:read': '' })).toThrow(/description/);
  });

  it('contains the foundation permissions and recognises codes', () => {
    expect(ALL_PERMISSION_CODES).toContain('approvals:task:act');
    expect(ALL_PERMISSION_CODES).toContain('audit:log:read');
    expect(isPermissionCode('access:role:manage')).toBe(true);
    expect(isPermissionCode('made:up:read')).toBe(false);
    expect(Object.keys(PERMISSION_CATALOGUE).length).toBe(ALL_PERMISSION_CODES.length);
  });
});

describe('Principal.can', () => {
  const read = 'approvals:instance:read';

  it('denies a permission the user does not hold', () => {
    expect(principal([]).can(read)).toBe(false);
  });

  it('allows a globally granted permission everywhere', () => {
    const p = principal([grant({ permissions: new Set([read]) })]);
    expect(p.can(read)).toBe(true);
    expect(p.can(read, { portfolioId: PORTFOLIO_B })).toBe(true);
  });

  it('limits a portfolio-scoped permission to that portfolio', () => {
    const p = principal([
      grant({ permissions: new Set([read]), scope: { scopeType: 'portfolio', scopeId: PORTFOLIO_A } }),
    ]);
    expect(p.can(read)).toBe(true); // "anywhere?" for the route guard
    expect(p.can(read, { portfolioId: PORTFOLIO_A, streamId: STREAM_A1 })).toBe(true);
    expect(p.can(read, { portfolioId: PORTFOLIO_B })).toBe(false);
    expect(p.can(read, {})).toBe(false);
  });

  it('matches a record that belongs to several portfolios or applications', () => {
    const inPortfolio = principal([grant({ permissions: new Set([read]), scope: { scopeType: 'portfolio', scopeId: PORTFOLIO_A } })]);
    expect(inPortfolio.can(read, { portfolioIds: [PORTFOLIO_B, PORTFOLIO_A] })).toBe(true);
    expect(inPortfolio.can(read, { portfolioIds: [PORTFOLIO_B] })).toBe(false);
    expect(inPortfolio.can(read, { portfolioIds: [] })).toBe(false);
    const onApplication = principal([grant({ permissions: new Set([read]), scope: { scopeType: 'application', scopeId: PORTFOLIO_A } })]);
    expect(onApplication.can(read, { applicationIds: [PORTFOLIO_A] })).toBe(true);
    expect(onApplication.can(read, { applicationIds: [PORTFOLIO_B], portfolioIds: [PORTFOLIO_A] })).toBe(false);
  });

  it.each([
    ['department', { departmentId: PORTFOLIO_A }],
    ['stream', { streamId: PORTFOLIO_A }],
    ['application', { applicationId: PORTFOLIO_A }],
    ['vendor', { vendorId: PORTFOLIO_A }],
  ] as const)('matches %s scopes by id', (scopeType, resource) => {
    const p = principal([grant({ permissions: new Set([read]), scope: { scopeType, scopeId: PORTFOLIO_A } })]);
    expect(p.can(read, resource)).toBe(true);
    expect(p.can(read, { portfolioId: PORTFOLIO_A })).toBe(false);
  });

  it('gives a system admin every catalogue permission', () => {
    const p = principal([], { isSystemAdmin: true });
    expect(p.can('access:role:manage', { portfolioId: PORTFOLIO_B })).toBe(true);
    expect(p.permissionCodes()).toEqual([...ALL_PERMISSION_CODES].sort());
  });

  it('lists distinct permission codes and role codes', () => {
    const p = principal([
      grant({ roleCode: 'pmo', permissions: new Set([read, 'audit:log:read']) }),
      grant({ roleCode: 'tech-exco', permissions: new Set([read]) }),
    ]);
    expect(p.permissionCodes()).toEqual(['approvals:instance:read', 'audit:log:read']);
    expect(p.roleCodes()).toEqual(['pmo', 'tech-exco']);
  });
});

describe('canViewClass (financial and other restricted data)', () => {
  const inPortfolioA: VisibilityContext = { ownerId: SOMEONE, scope: { portfolioId: PORTFOLIO_A, streamId: STREAM_A1 } };

  it("applies a vendor's role like anyone's: its data access decides (the seeded Vendor role has none)", () => {
    const granted = principal([grant({ dataAccess: { financial: 'all', contract: 'all', personal: 'all' } })], { isExternal: true });
    const seeded = principal([grant({ dataAccess: { financial: 'none', contract: 'none', personal: 'none' } })], { isExternal: true });
    for (const dataClass of ['financial', 'contract', 'personal'] as const) {
      expect(canViewClass(granted, dataClass, inPortfolioA)).toBe(true);
      expect(canViewClass(seeded, dataClass, inPortfolioA)).toBe(false);
    }
    expect(canViewClass(seeded, 'financial', { ...inPortfolioA, approverOf: true, approversSeeFinancials: true })).toBe(true);
  });

  it('shows everything to roles with "all"', () => {
    const exco = principal([grant({ dataAccess: { ...NO_DATA_ACCESS, financial: 'all' } })]);
    expect(canViewClass(exco, 'financial', inPortfolioA)).toBe(true);
    expect(canViewClass(exco, 'contract', inPortfolioA)).toBe(false);
  });

  it('portfolio lead: own portfolio only', () => {
    const lead = principal([
      grant({ scope: { scopeType: 'portfolio', scopeId: PORTFOLIO_A }, dataAccess: { ...NO_DATA_ACCESS, financial: 'scope' } }),
    ]);
    expect(canViewClass(lead, 'financial', inPortfolioA)).toBe(true);
    expect(canViewClass(lead, 'financial', { ownerId: SOMEONE, scope: { portfolioId: PORTFOLIO_B } })).toBe(false);
  });

  it('a "scope" level on a global assignment covers everything', () => {
    const p = principal([grant({ dataAccess: { ...NO_DATA_ACCESS, financial: 'scope' } })]);
    expect(canViewClass(p, 'financial', { scope: {} })).toBe(true);
  });

  it('product manager: own submissions only', () => {
    const pm = principal([grant({ dataAccess: { ...NO_DATA_ACCESS, financial: 'own' } })]);
    expect(canViewClass(pm, 'financial', { ownerId: ME, scope: {} })).toBe(true);
    expect(canViewClass(pm, 'financial', inPortfolioA)).toBe(false);
    expect(canViewClass(pm, 'financial', { scope: {} })).toBe(false);
  });

  it('approvers see financials of items they approve when the workflow allows it', () => {
    const approver = principal([]);
    expect(canViewClass(approver, 'financial', { ...inPortfolioA, approverOf: true, approversSeeFinancials: true })).toBe(true);
    expect(canViewClass(approver, 'financial', { ...inPortfolioA, approverOf: true, approversSeeFinancials: false })).toBe(false);
    expect(canViewClass(approver, 'financial', { ...inPortfolioA, approverOf: false, approversSeeFinancials: true })).toBe(false);
    expect(canViewClass(approver, 'contract', { ...inPortfolioA, approverOf: true, approversSeeFinancials: true })).toBe(false);
  });

  it('denies by default', () => {
    expect(canViewClass(principal([]), 'personal', inPortfolioA)).toBe(false);
  });
});

describe('maskClassified', () => {
  const record = { id: '1', title: 'New CRM', tco: '1200000.00', contractRate: '950.00', notes: 'ok' };
  const classes = { tco: 'financial', contractRate: 'contract' } as const;

  it('returns null for classified fields the user may not see and leaves others intact', () => {
    const masked = maskClassified(record, classes, principal([]), { scope: {} });
    expect(masked).toEqual({ id: '1', title: 'New CRM', tco: null, contractRate: null, notes: 'ok' });
    expect(record.tco).toBe('1200000.00'); // original untouched
  });

  it('keeps fields the user may see', () => {
    const p = principal([grant({ dataAccess: { ...NO_DATA_ACCESS, financial: 'all' } })]);
    expect(maskClassified(record, classes, p, { scope: {} })).toMatchObject({ tco: '1200000.00', contractRate: null });
  });
});
