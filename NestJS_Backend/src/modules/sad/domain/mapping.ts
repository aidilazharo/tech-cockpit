import type { Box, DiagramContent } from './diagrams.js';

/** A call between two applications as one approved solution diagram describes it. */
export interface DrawnCall {
  lineId: string;
  /** TRM application ids */
  caller: string;
  callee: string;
  calls: string | null;
  does: string | null;
  twoWay: boolean;
  /** The other application, as its block was picked from TRM */
  other: { id: string; label: string; number: string | null };
}

/**
 * The calls between the application (`owner`: its parts or its own box) and applications picked from TRM, read
 * from its solution diagram. A line goes from caller to callee (two-way: both). Nothing else counts: connections
 * inside the application, with typed applications, actors, external parties or other boxes, or between two other applications.
 */
export function callsOf(owner: string, content: DiagramContent): DrawnCall[] {
  if ('notApplicable' in content) return [];
  return content.diagrams.flatMap((diagram) => {
    const own = new Set([...diagram.boxes.filter((box) => box.type === 'part'), ...diagram.zones.filter((zone) => zone.kind === 'This application')].map((item) => item.id));
    const linked = new Map(diagram.boxes.filter((box): box is Box & { application: NonNullable<Box['application']> } => box.type === 'business' && !!box.application).map((box) => [box.id, box]));
    return diagram.lines.flatMap((line): DrawnCall[] => {
      const outgoing = own.has(line.from) ? linked.get(line.to) : undefined;
      const incoming = own.has(line.to) ? linked.get(line.from) : undefined;
      const other = outgoing ?? incoming;
      if (!other) return [];
      const app = other.application.id;
      return [
        {
          lineId: line.id,
          caller: outgoing ? owner : app,
          callee: outgoing ? app : owner,
          calls: line.calls ?? null,
          does: line.does ?? null,
          twoWay: line.twoWay === true,
          other: { id: app, label: other.label, number: other.application.number },
        },
      ];
    });
  });
}
