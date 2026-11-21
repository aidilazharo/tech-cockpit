import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { notificationText } from './notification-text'
import type { Notification } from './schemas'

const t = i18n.t.bind(i18n)
const base = { subjectTitle: 'CRM upgrade', workflow: 'Business case', step: 'Tech EXCO' }
const make = (type: Notification['type'], params: Notification['params'] = {}): Notification => ({
  id: '60000000-0000-4000-8000-000000000001',
  type,
  params: { ...base, ...params },
  link: '/approvals/x',
  readAt: null,
  createdAt: '2026-10-21T00:00:00.000Z',
})

describe('notificationText', () => {
  it.each([
    ['approval.task.assigned', {}, 'Business case "CRM upgrade" is waiting for your decision (Tech EXCO)'],
    ['approval.task.assigned', { onBehalfOf: 'Ali Approver' }, 'Business case "CRM upgrade" is waiting for your decision (Tech EXCO), on behalf of Ali Approver'],
    ['approval.task.review-again', { round: 2 }, '"CRM upgrade" was resubmitted and needs your review again (Tech EXCO)'],
    ['approval.task.escalated', {}, '"CRM upgrade" was escalated to you because its time limit passed (Tech EXCO)'],
    ['approval.request.approved', {}, 'Your Business case "CRM upgrade" was approved'],
    ['approval.request.cancelled', {}, 'Your Business case "CRM upgrade" was cancelled'],
    ['sad.upload.malicious', { file: 'invoice.pdf', application: 'CRM' }, 'Malware was found in "invoice.pdf", uploaded to CRM\'s SAD: the file is blocked and deleted'],
    ['sad.upload.malicious', { file: 'invoice.pdf', application: null }, 'Malware was found in "invoice.pdf", uploaded to a SAD: the file is blocked and deleted'],
  ] as const)('words %s', (type, params, title) => {
    expect(notificationText(t, make(type, params))).toEqual({ title, detail: null })
  })

  it('shows the due time of an SLA reminder in Malaysia time', () => {
    expect(notificationText(t, make('approval.task.sla-reminder', { dueAt: '2026-10-21T01:00:00.000Z' })).title).toMatch(
      /^Reminder: "CRM upgrade" is due by 21 Oct 2026, 9:00\s?am \(Tech EXCO\)$/i,
    )
  })

  it('quotes the reason, question or answer', () => {
    expect(notificationText(t, make('approval.request.returned', { reason: 'TCO misses licences' })).detail).toBe('Reason: TCO misses licences')
    expect(notificationText(t, make('approval.task.reassigned', { reason: 'On leave' })).detail).toBe('Reason: On leave')
    expect(notificationText(t, make('approval.request.info-requested', { question: 'Which vendor?' })).detail).toBe('Question: Which vendor?')
    expect(notificationText(t, make('approval.task.info-answered', { answer: 'Vendor A' })).detail).toBe('Answer: Vendor A')
    expect(notificationText(t, make('approval.request.returned', { reason: null })).detail).toBeNull()
  })
})
