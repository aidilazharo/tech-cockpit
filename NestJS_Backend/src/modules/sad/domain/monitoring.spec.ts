import { describe, expect, it } from 'vitest';
import { emptyContent, slotContentSchema, viewAnswered, type Diagram } from './diagrams.js';

const SERVICENOW = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
type Drawn = { diagrams: Diagram[] };

const block = (id: string, label: string, type: string, extra: object = {}) => ({ id, label, type, x: 0, y: 0, ...extra });

/** Dynatrace and Application Insights, ServiceNow from TRM, a typed pager tool, the support team; a group; labelled connections. */
const drawn = (): Drawn => {
  const content = emptyContent('monitoring') as Drawn;
  const diagram = content.diagrams[0];
  diagram.zones.push({ id: 'azure', label: 'Azure Monitor', x: 0, y: 0, width: 400, height: 200 });
  diagram.boxes.push(
    block('dynatrace', 'Dynatrace', 'monitoring'),
    block('insights', 'Application Insights', 'monitoring', { icon: 'application-insights', parentId: 'azure' }),
    block('servicenow', 'ServiceNow', 'system', { application: { id: SERVICENOW, number: 'APM-0300' } }),
    block('pager', 'PagerDuty', 'system'),
    block('support', 'Support team', 'team'),
  );
  diagram.lines.push(
    { id: 'l1', from: 'dynatrace', to: 'servicenow', label: 'Incident' },
    { id: 'l2', from: 'servicenow', to: 'support' },
    { id: 'l3', from: 'insights', to: 'pager', label: 'Alert', dashed: true },
  );
  return content;
};
const edit = (fn: (diagram: Diagram) => void) => {
  const content = drawn();
  fn(content.diagrams[0]);
  return content;
};
const messages = (content: unknown) => {
  const result = slotContentSchema('monitoring').safeParse(content);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('the monitoring diagram', () => {
  it('holds monitoring services, other systems from TRM or typed, teams and groups, with labelled connections', () => {
    expect(messages(drawn())).toEqual([]);
  });

  it.each<[string, (diagram: Diagram) => void, string]>([
    ['a block of another kind', (d) => d.boxes.push(block('web', 'CRM web', 'web')), 'Choose Monitoring service, Other system or Team / person'],
    ['a TRM link on a monitoring service', (d) => (d.boxes[0] = { ...d.boxes[0], application: { id: SERVICENOW, number: null } }), 'Only an other system links to TRM'],
    ['a TRM link on a team', (d) => (d.boxes[4] = { ...d.boxes[4], application: { id: SERVICENOW, number: null } }), 'Only an other system links to TRM'],
  ])('refuses %s', (_, change, message) => {
    expect(messages(edit(change))).toContain(message);
  });

  it('starts empty, and counts as answered with a block on every diagram', () => {
    expect(emptyContent('monitoring')).toEqual({ diagrams: [{ id: 'monitoring-1', title: 'Monitoring', sizing: 'auto', zones: [], boxes: [], lines: [] }] });
    expect(viewAnswered('monitoring', 'monitoring', emptyContent('monitoring'))).toBe(false);
    expect(viewAnswered('monitoring', 'monitoring', drawn())).toBe(true);
  });
});
