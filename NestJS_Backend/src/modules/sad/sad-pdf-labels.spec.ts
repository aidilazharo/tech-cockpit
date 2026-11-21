import { describe, expect, it } from 'vitest';
import type { Box, Diagram, Line } from './domain/diagrams.js';
import { apiName, boxKind, dataObjects, direction, lineLabel, lineStyle, stepKind, tlsText, zoneKind, zonePath } from './sad-pdf-labels.js';

const box = (overrides: Partial<Box>): Box => ({ id: 'box-1', label: 'Box', type: 'part', x: 0, y: 0, ...overrides });
const line = (overrides: Partial<Line> = {}): Line => ({ id: 'line-1', from: 'a', to: 'b', ...overrides });

describe('what the PDF calls a box (as the web app does)', () => {
  it.each<[string, Parameters<typeof boxKind>[0], Partial<Box>, string]>([
    ['a solution block', 'solution', { type: 'actor' }, 'Actor'],
    ['a business application from TRM', 'solution', { type: 'business', application: { id: '00000000-0000-4000-8000-000000000001', number: 'APM-7' } }, 'Business application · TRM APM-7'],
    ['a business application from TRM without a number', 'solution', { type: 'business', application: { id: '00000000-0000-4000-8000-000000000001', number: null } }, 'Business application · TRM '],
    ['a typed business application', 'solution', { type: 'business' }, 'Business application · typed, not in TRM'],
    ['a block with an Azure icon', 'solution', { type: 'part', icon: 'app-services' }, 'App Services · Part of this application'],
    ['a generic shape', 'solution', { type: 'database' }, 'Database'],
    ['an unknown type', 'solution', { type: 'gizmo' }, 'gizmo'],
    ['a CI step', 'ci-cd', { type: 'decision' }, 'Decision'],
    ['an approval naming who approves', 'ci-cd', { type: 'approval', approver: 'CAB' }, 'Approval · CAB'],
    ['an approval missing who approves', 'ci-cd', { type: 'approval' }, 'Approval · who approves still missing'],
    ['a monitoring service', 'monitoring', { type: 'monitoring' }, 'Monitoring service'],
    ['an Azure monitoring service', 'monitoring', { type: 'monitoring', icon: 'monitor' }, 'Monitor · Monitoring service'],
    ['an other system from TRM', 'monitoring', { type: 'system', application: { id: '00000000-0000-4000-8000-000000000001', number: 'APM-9' } }, 'Other system · TRM APM-9'],
    ['a typed other system', 'monitoring', { type: 'system' }, 'Other system · typed, not in TRM'],
    ['a team', 'monitoring', { type: 'team' }, 'Team / person'],
    ['an infrastructure server from TRM', 'infrastructure', { type: 'server', server: { id: '00000000-0000-4000-8000-000000000001' } }, 'Server / VM · TRM'],
    ['a typed server', 'infrastructure', { type: 'server' }, 'Server / VM'],
    ['an Azure service', 'infrastructure', { type: 'azure', icon: 'app-services' }, 'App Services'],
    ['a generic Azure service shape', 'infrastructure', { type: 'web' }, 'Web (Azure service)'],
    ['an infrastructure business application', 'infrastructure', { type: 'business' }, 'Business application · typed, not in TRM'],
    ['an unknown infrastructure kind', 'infrastructure', { type: 'gizmo' }, 'gizmo'],
  ])('names %s', (_, slot, overrides, expected) => {
    expect(boxKind(slot, box(overrides))).toBe(expected);
  });

  it('names step kinds without who approves (the Steps table has its own column), and zone kinds', () => {
    expect(stepKind('approval')).toBe('Approval');
    expect(stepKind('odd')).toBe('odd');
    expect(zoneKind('vnet')).toBe('VNet');
    expect(zoneKind('lane')).toBe('Lane');
    expect(zoneKind('This application')).toBe('This application');
    expect(zoneKind(undefined)).toBeUndefined();
  });
});

describe('what a line says in each view', () => {
  it('says what it calls in the Solution view, marked when facts are missing', () => {
    expect(lineLabel('solution', line({ calls: 'Policy API', does: 'Creates policies' }))).toEqual({ label: 'Policy API', missing: false });
    expect(lineLabel('solution', line({ calls: '  ' }))).toEqual({ label: 'Not described yet', missing: true });
  });

  it('gives the data objects, classification and frequency in the Data flow view', () => {
    expect(lineLabel('data-flow', line({ data: 'Policy\n  \nCustomer', classification: 'confidential', frequency: 'Daily' }))).toEqual({ label: 'Policy; Customer · Confidential · Daily', missing: false });
    expect(lineLabel('data-flow', line({ data: 'Policy' }))).toEqual({ label: 'Policy', missing: true });
    expect(lineLabel('data-flow', line())).toEqual({ label: 'No data objects', missing: false });
  });

  it('gives protocol, port and TLS (or what protects it) in the Integration view, flagging old TLS', () => {
    const facts = { layer: 'integration' as const, pattern: 'api' as const, api: { id: '00000000-0000-4000-8000-000000000001' }, authentication: 'mTLS', classification: 'internal' as const, purpose: 'Sync', flow: 'service' as const };
    expect(lineLabel('integration', line({ ...facts, protocol: 'HTTPS', port: 443, tls: '1.2' }))).toEqual({ label: 'HTTPS 443 · TLS 1.2', missing: false, nonCompliant: false });
    expect(lineLabel('integration', line({ ...facts, protocol: 'SFTP', port: 22, tls: 'none', protection: 'SSH' }))).toEqual({ label: 'SFTP 22 · SSH', missing: false, nonCompliant: false });
    expect(lineLabel('integration', line({ ...facts, port: 21, tls: 'none' }))).toEqual({ label: '21 · Not TLS', missing: true, nonCompliant: false });
    expect(lineLabel('integration', line({ ...facts, protocol: 'HTTPS', port: 443, tls: '1.0' }))).toEqual({ label: 'HTTPS 443 · TLS 1.0', missing: false, nonCompliant: true });
    expect(lineLabel('integration', line({ layer: 'integration' }))).toEqual({ label: 'Not described yet', missing: true, nonCompliant: false });
  });

  it('shows the label elsewhere', () => {
    expect(lineLabel('process', line({ label: 'Yes' }))).toEqual({ label: 'Yes', missing: false });
    expect(lineLabel('infrastructure', line())).toEqual({ label: undefined, missing: false });
  });
});

describe('connection facts in words', () => {
  it('words TLS, style, direction, data objects and the linked API', () => {
    expect(tlsText(line())).toBe('—');
    expect(tlsText(line({ tls: 'none' }))).toBe('Not TLS');
    expect(tlsText(line({ tls: 'none', protection: 'SSH' }))).toBe('Not TLS: SSH');
    expect(tlsText(line({ layer: 'integration', tls: '1.1' }))).toBe('1.1 (not compliant)');
    expect(tlsText(line({ tls: '1.3' }))).toBe('1.3');
    expect(lineStyle(line())).toBe('Solid · One-way');
    expect(lineStyle(line({ dashed: true, twoWay: true }))).toBe('Dashed · Two-way');
    expect(direction(line({ twoWay: true }))).toBe('Two-way');
    expect(dataObjects(line({ data: ' a \n\n b ' }))).toEqual(['a', 'b']);
    const apis = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Policy API' }];
    expect(apiName(apis, line({ api: { id: apis[0].id } }))).toBe('Policy API');
    expect(apiName(apis, line({ api: { id: '00000000-0000-4000-8000-000000000002' } }))).toBe('—');
    expect(apiName(apis, line())).toBe('—');
  });

  it('gives a box zone as its full path, outermost first', () => {
    const diagram: Diagram = {
      id: 'production',
      title: 'Production',
      sizing: 'auto',
      zones: [
        { id: 'sub', label: 'MY01', x: 0, y: 0, width: 400, height: 400 },
        { id: 'vnet', label: 'vnet-crm', parentId: 'sub', x: 10, y: 40, width: 300, height: 300 },
      ],
      boxes: [box({ id: 'vm', parentId: 'vnet' }), box({ id: 'top' })],
      lines: [],
    };
    expect(zonePath(diagram, 'vm')).toBe('MY01 › vnet-crm');
    expect(zonePath(diagram, 'top')).toBe('—');
    expect(zonePath(diagram, 'sub')).toBe('—');
  });
});
