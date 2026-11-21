import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Dropdown } from '../../components/qi'
import { cn } from '../../lib/cn'
import { todayMy } from '../../lib/dates'

type TimelineScale = 'months' | 'quarters'
const SCALES: TimelineScale[] = ['months', 'quarters']

export interface TimelineSegment {
  /** First day, 'YYYY-MM-DD'; null = not set: the bar starts at the edge and fades in */
  start: string | null
  /** Last day (inclusive), 'YYYY-MM-DD'; null = not set: the bar runs to the edge and fades out */
  end: string | null
  /** Background class from the Qi data-visualisation tokens, e.g. 'bg-data-visualisation-positive' */
  colour: string
}

export interface TimelineItem {
  id: string
  label: ReactNode
  /** Text under the label; it says everything the bars and marks show */
  details: ReactNode
  segments: TimelineSegment[]
  /** Labelled marks, e.g. vendor end of support */
  markers?: { date: string; label: string }[]
}

export interface TimelineLegendEntry {
  label: string
  /** Bar colour class; leave out for a mark */
  colour?: string
  mark?: boolean
}

const DAY_MS = 86_400_000
/** Up to two years starts on months; longer starts on quarters. */
const MAX_MONTHS = 24

const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
/** Months since year 0, so that months and quarters are whole numbers. */
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
const monthStart = (index: number) => Date.UTC(Math.floor(index / 12), index % 12, 1)

/**
 * Bars on a year row with months (or quarters) underneath, fitted to the dates shown. It scrolls
 * sideways when the columns do not fit, keeping the names in view. The details under each name
 * carry the same information as the bars.
 */
export function Timeline({ items, label, legend, today = todayMy() }: { items: TimelineItem[]; label: string; legend: TimelineLegendEntry[]; today?: string }) {
  const { t, i18n } = useTranslation()
  const [chosen, setChosen] = useState<TimelineScale | null>(null)
  const dates = items.flatMap((item) => [...item.segments.flatMap((segment) => [segment.start, segment.end]), ...(item.markers ?? []).map((marker) => marker.date)])
  const known = dates.filter((date): date is string => date !== null)
  const months = (known.length > 0 ? known : [today]).map(monthIndex)
  const first = Math.min(...months)
  const last = Math.max(...months)
  const scale = chosen ?? (last - first + 1 <= MAX_MONTHS ? 'months' : 'quarters')

  const step = scale === 'months' ? 1 : 3
  const from = first - (first % step)
  const to = last - (last % step) + step
  const columns = Array.from({ length: (to - from) / step }, (_, i) => from + i * step)
  const years = [...new Set(columns.map((column) => Math.floor(column / 12)))].map((year) => ({ year, span: columns.filter((column) => Math.floor(column / 12) === year).length }))
  const rangeStart = monthStart(from)
  const at = (time: number) => ((time - rangeStart) / (monthStart(to) - rangeStart)) * 100
  const todayAt = at(day(today))
  const showToday = todayAt >= 0 && todayAt < 100
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ul aria-label={t('timeline.legend')} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2">
              <span aria-hidden="true" className={entry.mark ? 'h-4 w-1 rounded-full bg-text-default' : cn('h-3 w-5 rounded-sm', entry.colour)} />
              {entry.label}
            </li>
          ))}
        </ul>
        <div className="w-40">
          <Dropdown<TimelineScale>
            label={t('timeline.scale')}
            value={scale}
            onValueChange={(next) => next && setChosen(next)}
            options={SCALES.map((value) => ({ value, label: t(`timeline.${value}`) }))}
          />
        </div>
      </div>
      <div
        role="region"
        aria-label={t('timeline.chart', { name: label })}
        tabIndex={0}
        className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-border-focus"
      >
        <div className="[--label:9rem] md:[--label:16rem]" style={{ minWidth: `calc(var(--label) + ${columns.length * 3}rem)` }}>
          <div aria-hidden="true" className="grid grid-cols-[var(--label)_1fr]">
            <span className="sticky left-0 z-10 bg-surface-default" />
            <div data-scale className="flex flex-col text-xs">
              <div className="flex border-b border-divider-default font-semibold">
                {years.map(({ year, span }) => (
                  <span key={year} className="border-l border-divider-default py-1" style={{ flex: `${span} 1 0%` }}>
                    <span className="sticky left-(--label) px-1">{year}</span>
                  </span>
                ))}
              </div>
              <div className="flex text-text-subdued">
                {columns.map((column) => (
                  <span key={column} className="flex-1 border-l border-divider-subdued py-1 pl-1">
                    {scale === 'months' ? monthName.format(monthStart(column)) : t('timeline.quarter', { quarter: (column % 12) / 3 + 1 })}
                  </span>
                ))}
              </div>
              {showToday && (
                <div className="relative h-5">
                  <span className="absolute -translate-x-1/2 font-semibold" style={{ left: `${todayAt}%` }}>
                    {t('timeline.today')}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="relative">
            {/* Column lines first, so the bars (and the today line, last) paint over them. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 left-(--label) flex">
              {columns.map((column) => (
                <span key={column} className="flex-1 border-l border-divider-subdued" />
              ))}
            </div>
            <ul aria-label={label} className="flex flex-col">
              {items.map((item) => (
                <li key={item.id} className="grid grid-cols-[var(--label)_1fr] items-center border-b border-divider-subdued">
                  <div className="sticky left-0 z-10 flex flex-col gap-0.5 bg-surface-default py-2 pr-3">
                    {item.label}
                    <span className="flex flex-col text-xs text-text-subdued">{item.details}</span>
                  </div>
                  <div aria-hidden="true" className="relative h-4">
                    {item.segments.map((segment, i) => {
                      const left = segment.start ? at(day(segment.start)) : 0
                      const right = segment.end ? at(day(segment.end) + DAY_MS) : 100
                      return (
                        <span
                          key={i}
                          data-bar
                          className={cn(
                            'absolute inset-y-0 min-w-1 rounded-sm',
                            segment.colour,
                            !segment.start && 'mask-l-from-[calc(100%-4rem)]',
                            !segment.end && 'mask-r-from-[calc(100%-4rem)]',
                          )}
                          style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }}
                        />
                      )
                    })}
                    {(item.markers ?? []).map((marker) => (
                      <span
                        key={marker.label}
                        title={marker.label}
                        className="absolute -top-1 h-6 w-1 -translate-x-1/2 rounded-full bg-text-default"
                        style={{ left: `${at(day(marker.date))}%` }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {showToday && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 left-(--label)">
                <span data-today className="absolute inset-y-0 border-l-2 border-dashed border-text-default" style={{ left: `${todayAt}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
