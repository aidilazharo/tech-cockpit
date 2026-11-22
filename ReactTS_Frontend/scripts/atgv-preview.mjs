// Isolated synthetic API for local ATGV previews; never imported by production code.
// Only enabled by Vite's development server when ATGV sets VITE_ATGV_PROJECT.
const ID = '80000000-0000-4000-8000-000000000001';
const OTHER_ID = '80000000-0000-4000-8000-000000000002';

const applications = Object.freeze([
  { id: ID, number: 'ATGV-DEMO-001', name: 'Example Customer Portal (MOCK)',
    installStatus: 'In Production', criticalityRating: '3 - Medium',
    businessUnit: 'Technology (MOCK)', timeRating: 'invest',
    capability: null, capabilityMismatch: false, portfolios: [], missingSince: null },
  { id: OTHER_ID, number: 'ATGV-DEMO-002', name: 'Example Payments Platform (MOCK)',
    installStatus: 'In Development', criticalityRating: '2 - High',
    businessUnit: 'Technology (MOCK)', timeRating: 'tolerate',
    capability: null, capabilityMismatch: false, portfolios: [], missingSince: null },
]);

export function atgvPreviewEnabled(env = process.env) {
  return Boolean(env.VITE_ATGV_PROJECT) &&
    env.ATGV_TECHCOCKPIT_REAL_API !== '1' &&
    env.NODE_ENV !== 'production';
}

function page(items, params) {
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.get('pageSize')) || 25));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
}

function applicationDetail(item) {
  const nullFields = ['displayName', 'shortName', 'description', 'operationalStatus',
    'recordStatus', 'installType', 'groupOrLocal', 'ownedBusinessUnit',
    'servingBusinessUnits', 'bcmCriticality', 'rto', 'rpo',
    'recoveryTimeCapability', 'snUpdatedOn'];
  const detail = Object.fromEntries(nullFields.map(name => [name, null]));
  const trm = Object.fromEntries(['timeRationale', 'functionalFit', 'technicalFit',
    'plannedGoLive', 'plannedPhaseOut', 'plannedRetirement', 'vendorEndOfSupport']
    .map(name => [name, null]));
  return {
    ...detail, ...item, version: 1, snSysId: 'atgv-mock-' + item.id,
    people: { itApplicationOwner: null, applicationLead: null, applicationManager: null },
    costs: { licence: null, internalSupport: null, externalSupport: null,
      infraOnPremises: null, infraCloud: null },
    capability: { path: [], mismatch: false, fields: { group: null, family: null, category: null } },
    subdomains: [], trm: { ...trm, timeRating: item.timeRating },
    services: [], restricted: [], source: null, canEdit: false,
    canSetPortfolios: false, canSetDomains: false
  };
}

function problem(status, detail) {
  return { status, body: { type: 'about:blank', title: status === 405 ? 'Read-only mock preview' :
    'Mock endpoint unavailable', status, detail } };
}

// Pure response function, tested without Vite, a database, or Okta.
export function mockAtgvResponse(method = 'GET', path = '/') {
  const url = new URL(path, 'http://127.0.0.1');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (!pathname.startsWith('/api/')) return null;

  if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
    return { status: 200, body: { accessExpiresAt: new Date(Date.now() + 900000).toISOString() } };
  }
  if (method === 'POST' && pathname === '/api/v1/auth/logout') {
    return { status: 204, body: null };
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return problem(405, 'ATGV preview is read-only. No changes were persisted or sent to a real backend.');
  }

  if (pathname === '/api/v1/health') {
    return { status: 200, body: { status: 'ok', database: 'mock', mode: 'atgv-local-preview' } };
  }
  if (pathname === '/api/v1/me') {
    return { status: 200, body: {
      user: { id: '00000000-0000-4000-8000-000000000001', username: 'atgv.preview',
        email: 'atgv-preview@example.invalid', firstName: 'ATGV', lastName: 'Preview',
        isExternal: false },
      roles: ['ATGV Preview'], permissions: ['trm:application:read'],
      isSystemAdmin: false, authMethod: 'session',
      session: { accessExpiresAt: new Date(Date.now() + 900000).toISOString(),
        expiresAt: new Date(Date.now() + 14400000).toISOString() }
    } };
  }
  if (pathname === '/api/v1/me/notifications/unread-count') {
    return { status: 200, body: { unread: 0 } };
  }
  if (pathname === '/api/v1/me/notifications') {
    return { status: 200, body: { ...page([], url.searchParams), unread: 0 } };
  }
  if (pathname === '/api/v1/trm/facets') {
    return { status: 200, body: {
      installStatuses: ['In Production', 'In Development'], criticalityRatings: ['2 - High', '3 - Medium'],
      businessUnits: ['Technology (MOCK)'], environments: [],
      productStandardStatuses: []
    } };
  }
  if (pathname === '/api/v1/trm/capabilities' || pathname === '/api/v1/portfolios') {
    return { status: 200, body: { items: [] } };
  }
  if (pathname === '/api/v1/trm/applications') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    let matches = applications.filter(item => !q || (item.name || '').toLowerCase().includes(q) ||
      (item.number || '').toLowerCase().includes(q));
    for (const key of ['installStatus', 'criticalityRating', 'businessUnit', 'timeRating']) {
      const value = url.searchParams.get(key);
      if (value && value !== 'none') matches = matches.filter(item => item[key] === value);
      if (value === 'none') matches = matches.filter(item => item[key] === null);
    }
    return { status: 200, body: page(matches, url.searchParams) };
  }
  if (pathname.startsWith('/api/v1/trm/applications/')) {
    const id = pathname.slice('/api/v1/trm/applications/'.length);
    const item = applications.find(app => app.id === id);
    return item ? { status: 200, body: applicationDetail(item) } :
      { status: 404, body: { title: 'Not found', status: 404, detail: 'Synthetic application not found.' } };
  }
  if (['services', 'software-models', 'product-standards', 'servers'].some(
    resource => pathname === '/api/v1/trm/' + resource)) {
    return { status: 200, body: page([], url.searchParams) };
  }
  return problem(501, 'This endpoint is not simulated. Real enterprise APIs and databases are disconnected.');
}

export function createAtgvPreviewPlugin() {
  return {
    name: 'techcockpit-atgv-local-preview',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const result = mockAtgvResponse(req.method, req.url);
        if (result === null) return next();
        res.statusCode = result.status;
        res.setHeader('content-type', result.status >= 400 ? 'application/problem+json' : 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('x-techcockpit-atgv-preview', 'synthetic-read-only');
        res.end(result.status === 204 || req.method === 'HEAD' ? '' : JSON.stringify(result.body));
      });
    },
    transformIndexHtml() {
      return [{ tag: 'style', attrs: { 'data-techcockpit-atgv-preview': 'true' },
        children: "body::after{content:'ATGV LOCAL PREVIEW - SYNTHETIC DATA';position:fixed;bottom:8px;right:8px;z-index:2147483000;pointer-events:none;background:#661a25;color:#fff;padding:6px 10px;border-radius:4px;font:700 11px system-ui,sans-serif;box-shadow:0 2px 10px #0006}",
        injectTo: 'head' }];
    },
  };
}
