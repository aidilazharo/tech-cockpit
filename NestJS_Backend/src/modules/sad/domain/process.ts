import type { z } from 'zod';
import type { Diagram } from './diagrams.js';

/** The kinds of step in a CI or CD flow: Start and End (rounded), Step (an action), Decision (a diamond) and Approval (names who approves). */
export const PROCESS_STEPS = ['start', 'end', 'step', 'decision', 'approval'] as const;

/** CI and CD flows: lanes (one per team or tool, side by side, none inside another) hold every step; connections join steps. */
export function processRules(diagrams: Diagram[], ctx: z.RefinementCtx): void {
  diagrams.forEach((diagram, d) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ['diagrams', d, ...path], message });
    const lanes = new Set(diagram.zones.map((zone) => zone.id));
    diagram.zones.forEach((zone, z) => {
      if (zone.kind !== 'lane') issue(['zones', z, 'kind'], 'A CI or CD flow has lanes only');
      if (zone.parentId !== undefined) issue(['zones', z, 'parentId'], 'A lane sits on its own, not inside another');
    });
    diagram.boxes.forEach((box, b) => {
      if (!(PROCESS_STEPS as readonly string[]).includes(box.type)) issue(['boxes', b, 'type'], 'Choose Start, End, Step, Decision or Approval');
      if (box.parentId === undefined) issue(['boxes', b, 'parentId'], 'Every step sits in a lane');
      if (box.approver !== undefined && box.type !== 'approval') issue(['boxes', b, 'approver'], 'Only an approval step names who approves');
    });
    diagram.lines.forEach((line, l) => {
      if (lanes.has(line.from) || lanes.has(line.to)) issue(['lines', l], 'A connection joins two steps');
    });
  });
}

/** Every approval step names who approves (needed before submit). */
export function approversNamed(diagrams: Diagram[]): boolean {
  return diagrams.every((diagram) => diagram.boxes.every((box) => box.type !== 'approval' || !!box.approver?.trim()));
}
