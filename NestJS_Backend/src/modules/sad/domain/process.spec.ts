import { describe, expect, it } from 'vitest';
import { emptyContent, slotContentSchema, viewAnswered, type Diagram } from './diagrams.js';

type Drawn = { diagrams: Diagram[] };

const lane = (id: string, extra: object = {}) => ({ id, label: id, kind: 'lane', x: 0, y: 0, width: 1200, height: 150, ...extra });
const step = (id: string, type: string, parentId: string | undefined, extra: object = {}) => ({ id, label: id, type, ...(parentId ? { parentId } : {}), x: 40, y: 40, ...extra });

/** A CI flow: lanes for the developer and Azure DevOps, a step of each kind, an approval naming who approves, labelled connections. */
const drawn = (): Drawn => {
  const content = emptyContent('ci-cd') as Drawn;
  const flow = content.diagrams[0];
  flow.zones.push(lane('dev'), lane('ado', { y: 150 }));
  flow.boxes.push(
    step('start', 'start', 'dev'),
    step('pr', 'step', 'dev'),
    step('review', 'approval', 'ado', { approver: 'Tech lead' }),
    step('scan', 'decision', 'ado'),
    step('end', 'end', 'ado'),
  );
  flow.lines.push(
    { id: 'l1', from: 'start', to: 'pr' },
    { id: 'l2', from: 'pr', to: 'review' },
    { id: 'l3', from: 'review', to: 'scan', label: 'Approved' },
    { id: 'l4', from: 'scan', to: 'end', label: 'Yes' },
    { id: 'l5', from: 'scan', to: 'pr', label: 'No: fix findings', dashed: true },
  );
  return content;
};
const edit = (fn: (flow: Diagram) => void) => {
  const content = drawn();
  fn(content.diagrams[0]);
  return content;
};
const messages = (content: unknown, slot: 'ci-cd' | 'monitoring' = 'ci-cd') => {
  const result = slotContentSchema(slot).safeParse(content);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('CI and CD flows', () => {
  it('hold lanes with steps of five kinds, approvals naming who approves, and labelled connections', () => {
    expect(messages(drawn())).toEqual([]);
  });

  it.each<[string, (flow: Diagram) => void, string]>([
    ['a zone that is not a lane', (f) => f.zones.push({ ...lane('vnet'), kind: 'vnet' }), 'A CI or CD flow has lanes only'],
    ['a lane inside a lane', (f) => f.zones.push(lane('inner', { parentId: 'dev' })), 'A lane sits on its own, not inside another'],
    ['a step outside the lanes', (f) => f.boxes.push(step('loose', 'step', undefined)), 'Every step sits in a lane'],
    ['a step that is not one of the five kinds', (f) => f.boxes.push(step('web', 'web', 'dev')), 'Choose Start, End, Step, Decision or Approval'],
    ['who approves on a step that is not an approval', (f) => (f.boxes[1] = { ...f.boxes[1], approver: 'CAB' }), 'Only an approval step names who approves'],
    ['a connection to a lane', (f) => f.lines.push({ id: 'l9', from: 'start', to: 'ado' }), 'A connection joins two steps'],
  ])('refuses %s', (_, change, message) => {
    expect(messages(edit(change))).toContain(message);
  });

  it('keeps who approves to CI and CD flows', () => {
    const monitoring = { diagrams: [{ id: 'm', title: 'M', sizing: 'auto', zones: [], boxes: [step('a', 'team', undefined, { approver: 'CAB' })], lines: [] }] };
    expect(messages(monitoring, 'monitoring')).toEqual(['Only a CI or CD flow has this']);
  });
});

describe('when CI and CD flows count as answered', () => {
  it('needs a step on every flow and every approval naming who approves', () => {
    expect(viewAnswered('ci-cd', 'process', drawn())).toBe(true);
    expect(viewAnswered('ci-cd', 'process', edit((f) => (f.boxes[2] = { ...f.boxes[2], approver: '  ' })))).toBe(false);
    expect(viewAnswered('ci-cd', 'process', edit((f) => (f.boxes[2] = { ...f.boxes[2], approver: undefined })))).toBe(false);
    expect(viewAnswered('ci-cd', 'process', emptyContent('ci-cd'))).toBe(false);
    expect(viewAnswered('ci-cd', 'process', { notApplicable: true, reason: 'Vendor deploys the SaaS' })).toBe(true);
  });
});
