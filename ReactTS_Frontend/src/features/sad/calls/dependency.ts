import type { ApplicationCall, Box, CallApplication, Diagram, Line } from '../schemas'

// Far enough apart that line labels, even those of lines spread between the same boxes, stay 24px apart when a phone
// fits the whole view (zoom about 0.27).
const ROW = 200
const LEFT = 0
const MIDDLE = 480
const RIGHT = 960

/** An application's name, else its APM number. */
export const appName = (app: CallApplication) => app.name ?? app.number ?? '—'

/**
 * One application's dependency view: it in the middle, the applications calling it on the left, those it calls on
 * the right (an application can be on both sides), and a line per call, labelled with what it calls (the canvas
 * spreads lines between the same boxes apart).
 */
export function dependencyDiagram(applicationId: string, calls: ApplicationCall[], restricted: string): Diagram {
  // Every call involves the application (the view is drawn only when there are calls).
  const centre = calls.map((call) => (call.caller.id === applicationId ? call.caller : call.callee))[0]
  const side = (prefix: 'in' | 'out', apps: CallApplication[], x: number): Box[] =>
    [...new Map(apps.map((app) => [app.id, app])).values()].map((app, row) => ({
      id: `${prefix}-${app.id}`,
      label: appName(app),
      type: 'business',
      application: { id: app.id, number: app.number },
      x,
      y: row * ROW,
    }))
  const callers = side('in', calls.filter((call) => call.callee.id === applicationId).map((call) => call.caller), LEFT)
  const callees = side('out', calls.filter((call) => call.caller.id === applicationId).map((call) => call.callee), RIGHT)
  const rows = Math.max(callers.length, callees.length, 1)
  const lines = calls.map((call, index): Line => {
    const outgoing = call.caller.id === applicationId
    const label = call.restricted ? restricted : call.calls
    return {
      id: `call-${index + 1}`,
      from: outgoing ? 'centre' : `in-${call.caller.id}`,
      to: outgoing ? `out-${call.callee.id}` : 'centre',
      ...(label ? { label } : {}),
      ...(call.twoWay ? { twoWay: true } : {}),
    }
  })
  return {
    id: 'dependencies',
    title: appName(centre),
    sizing: 'manual',
    zones: [],
    boxes: [{ id: 'centre', label: appName(centre), type: 'part', x: MIDDLE, y: ((rows - 1) * ROW) / 2 }, ...callers, ...callees],
    lines,
  }
}
