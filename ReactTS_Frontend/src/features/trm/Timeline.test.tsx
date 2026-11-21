import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Timeline, type TimelineItem } from './Timeline'

const GREEN = 'bg-data-visualisation-positive'
const ORANGE = 'bg-data-visualisation-category-3'
const item = (id: string, start: string | null, end: string | null): TimelineItem => ({ id, label: id, details: `${start} to ${end}`, segments: [{ start, end, colour: GREEN }] })

const rows = () => within(screen.getByRole('list', { name: 'Plans' })).getAllByRole('listitem')
const bars = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('[data-bar]')]
const percent = (value: string) => Number.parseFloat(value)
const scale = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-scale]')!

describe('Timeline', () => {
  it('fits a short range to whole months, under a year row, and writes the details out', () => {
    const { container } = render(
      <Timeline label="Plans" legend={[{ label: 'Proposed', colour: GREEN }]} today="2027-01-01" items={[item('AAA', '2026-10-01', '2026-10-31'), item('AAs', '2026-10-01', '2026-10-04')]} />,
    )
    expect(screen.getByRole('combobox', { name: 'Timeline scale' })).toHaveTextContent('Months')
    expect(scale(container)).toHaveTextContent(/^2026Oct$/)
    expect(rows()[0]).toHaveTextContent('AAA2026-10-01 to 2026-10-31')
    const [october] = bars(rows()[0])
    expect([percent(october.style.left), percent(october.style.width)]).toEqual([0, 100]) // the whole of October
    expect(october).toHaveClass(GREEN)
    expect(percent(bars(rows()[1])[0].style.width)).toBeCloseTo((4 / 31) * 100, 1)
    expect(within(screen.getByRole('list', { name: 'Timeline legend' })).getByRole('listitem')).toHaveTextContent('Proposed')
    expect(screen.queryByText('Today')).not.toBeInTheDocument() // today is after the range
    expect(screen.getByRole('region', { name: 'Plans chart' })).toHaveAttribute('tabindex', '0') // scrolls sideways by keyboard
  })

  it('starts on quarters beyond two years, switches to months, and marks today', async () => {
    const { container } = render(
      <Timeline
        label="Plans"
        legend={[{ label: 'In use', colour: GREEN }, { label: 'Vendor end of support', mark: true }]}
        today="2028-07-01"
        items={[
          {
            id: 'crm',
            label: 'CRM',
            details: 'CRM plan',
            segments: [
              { start: '2027-01-01', end: '2029-06-30', colour: GREEN },
              { start: '2029-07-01', end: '2030-12-31', colour: ORANGE },
            ],
            markers: [{ date: '2028-01-01', label: 'Vendor end of support' }],
          },
          item('hr', null, '2027-06-30'),
          item('data', '2028-01-01', null),
        ]}
      />,
    )
    // January 2027 to December 2030: 48 months.
    expect(screen.getByRole('combobox', { name: 'Timeline scale' })).toHaveTextContent('Quarters')
    expect(scale(container)).toHaveTextContent(/^2027202820292030(Q1Q2Q3Q4){4}Today$/)
    const [inUse, phasingOut] = bars(rows()[0])
    expect(percent(inUse.style.width)).toBeCloseTo((912 / 1461) * 100, 1)
    expect(percent(phasingOut.style.left)).toBeCloseTo((912 / 1461) * 100, 1)
    expect(phasingOut).toHaveClass(ORANGE)
    expect(rows()[0].querySelector('[title="Vendor end of support"]')).toHaveStyle({ left: `${(365 / 1461) * 100}%` })
    // A missing date runs the bar to the edge and fades that end.
    const [hr] = bars(rows()[1])
    expect(percent(hr.style.left)).toBe(0)
    expect(hr.className).toMatch(/mask-l-from/)
    expect(hr.className).not.toMatch(/mask-r-from/)
    const [data] = bars(rows()[2])
    expect(percent(data.style.left) + percent(data.style.width)).toBeCloseTo(100, 5)
    expect(data.className).toMatch(/mask-r-from/)
    expect(percent(container.querySelector<HTMLElement>('[data-today]')!.style.left)).toBeCloseTo((547 / 1461) * 100, 1)
    const legend = within(screen.getByRole('list', { name: 'Timeline legend' })).getAllByRole('listitem')
    expect(legend.map((entry) => entry.textContent)).toEqual(['In use', 'Vendor end of support'])

    await userEvent.click(screen.getByRole('combobox', { name: 'Timeline scale' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Months' }))
    expect(scale(container)).toHaveTextContent(/^2027202820292030(JanFebMarAprMayJunJulAugSepOctNovDec){4}Today$/)
    expect(percent(inUse.style.width)).toBeCloseTo((912 / 1461) * 100, 1) // same positions, finer scale
  })

  it('starts on months up to two years, and on quarters from the 25th month', () => {
    const { container, rerender } = render(<Timeline label="Plans" legend={[]} today="2020-01-01" items={[item('a', '2026-01-15', '2027-12-15')]} />)
    expect(screen.getByRole('combobox', { name: 'Timeline scale' })).toHaveTextContent('Months')
    expect(scale(container).textContent).toMatch(/^20262027Jan.*Dec$/)
    rerender(<Timeline label="Plans" legend={[]} today="2020-01-01" items={[item('b', '2026-01-15', '2028-01-15')]} />)
    expect(screen.getByRole('combobox', { name: 'Timeline scale' })).toHaveTextContent('Quarters')
    expect(scale(container)).toHaveTextContent(/^202620272028(Q1Q2Q3Q4){2}Q1$/)
  })

  it('shows the current month when nothing has a date yet', () => {
    const { container } = render(<Timeline label="Plans" legend={[]} today="2026-10-22" items={[{ id: 'x', label: 'X', details: 'No dates', segments: [] }]} />)
    expect(scale(container)).toHaveTextContent(/^2026OctToday$/)
    expect(bars(rows()[0])).toHaveLength(0)
  })
})
