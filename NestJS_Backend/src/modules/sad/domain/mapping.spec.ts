import { describe, expect, it } from 'vitest';
import type { Diagram } from './diagrams.js';
import { callsOf } from './mapping.js';

const CRM = '80000000-0000-4000-8000-000000000001';
const POLICY = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const PORTAL = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

const solution = (lines: Diagram['lines']): { diagrams: Diagram[] } => ({
  diagrams: [
    {
      id: 'solution',
      title: 'Solution diagram',
      sizing: 'auto',
      zones: [
        { id: 'zone-1', label: 'CRM', kind: 'This application', x: 0, y: 0, width: 400, height: 300 },
        { id: 'zone-2', label: 'Partners', x: 600, y: 0, width: 300, height: 300 },
      ],
      boxes: [
        { id: 'core', label: 'Core services', type: 'part', parentId: 'zone-1', x: 20, y: 40 },
        { id: 'web', label: 'Agent portal', type: 'part', parentId: 'zone-1', x: 20, y: 140 },
        { id: 'policy', label: 'Policy Admin', type: 'business', application: { id: POLICY, number: 'APM-0002' }, x: 600, y: 0 },
        { id: 'portal', label: 'Customer Portal', type: 'business', application: { id: PORTAL, number: null }, x: 600, y: 200 },
        { id: 'old', label: 'Old CRM', type: 'business', x: 600, y: 400 },
        { id: 'agent', label: 'Agent', type: 'actor', x: -300, y: 0 },
        { id: 'bank', label: 'Bank', type: 'external', x: 900, y: 0 },
      ],
      lines,
    },
  ],
});

describe('calls between applications, from an approved solution diagram', () => {
  it('reads the connections between the application (its parts or its own box) and applications picked from TRM', () => {
    const content = solution([
      { id: 'l1', from: 'core', to: 'policy', calls: 'Policy API: create policy', does: 'Issues policies', twoWay: true },
      { id: 'l2', from: 'portal', to: 'zone-1', calls: 'CRM Customer API' },
      { id: 'l3', from: 'web', to: 'portal' },
    ]);
    expect(callsOf(CRM, content)).toEqual([
      { lineId: 'l1', caller: CRM, callee: POLICY, calls: 'Policy API: create policy', does: 'Issues policies', twoWay: true, other: { id: POLICY, label: 'Policy Admin', number: 'APM-0002' } },
      { lineId: 'l2', caller: PORTAL, callee: CRM, calls: 'CRM Customer API', does: null, twoWay: false, other: { id: PORTAL, label: 'Customer Portal', number: null } },
      { lineId: 'l3', caller: CRM, callee: PORTAL, calls: null, does: null, twoWay: false, other: { id: PORTAL, label: 'Customer Portal', number: null } },
    ]);
  });

  it('leaves out connections inside the application, with typed applications, actors, external parties or other boxes, and between two other applications', () => {
    const content = solution([
      { id: 'l1', from: 'core', to: 'web' },
      { id: 'l2', from: 'core', to: 'old' },
      { id: 'l3', from: 'agent', to: 'web' },
      { id: 'l4', from: 'core', to: 'bank' },
      { id: 'l5', from: 'portal', to: 'policy' },
      { id: 'l6', from: 'zone-2', to: 'policy' },
    ]);
    expect(callsOf(CRM, content)).toEqual([]);
    expect(callsOf(CRM, { notApplicable: true, reason: 'Batch job' })).toEqual([]);
  });
});
