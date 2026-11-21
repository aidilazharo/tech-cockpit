import type { z } from 'zod';
import type { Diagram } from './diagrams.js';

/** Monitoring diagram blocks: monitoring services (e.g. Dynatrace, Azure Monitor), other systems (from TRM or typed) and teams or people. */
export const MONITORING_BLOCKS = ['monitoring', 'system', 'team'] as const;

/** The monitoring diagram: its three kinds of block; only an other system links to TRM. Grouping boxes and labels as on any diagram. */
export function monitoringRules(diagrams: Diagram[], ctx: z.RefinementCtx): void {
  diagrams.forEach((diagram, d) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ['diagrams', d, ...path], message });
    diagram.boxes.forEach((box, b) => {
      if (!(MONITORING_BLOCKS as readonly string[]).includes(box.type)) issue(['boxes', b, 'type'], 'Choose Monitoring service, Other system or Team / person');
      if (box.application && box.type !== 'system') issue(['boxes', b, 'application'], 'Only an other system links to TRM');
    });
  });
}
