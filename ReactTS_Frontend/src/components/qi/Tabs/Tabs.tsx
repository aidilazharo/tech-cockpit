import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

export interface TabItem<V extends string> {
  value: V
  label: string
  /** Small count after the label, e.g. tasks waiting */
  count?: number
}

export interface TabsProps<V extends string> {
  /** Accessible name of the tab list */
  label: string
  tabs: TabItem<V>[]
  value: V
  onValueChange: (value: V) => void
  /** Content of the selected tab */
  children: ReactNode
  /** Accessible name for the count, e.g. (n) => `${n} waiting` */
  countLabel?: (count: number) => string
}

/**
 * Qi tabs: 2–5 groups of content at the same level (Qi: never primary navigation,
 * never filters, never nested). Arrow keys move between tabs.
 */
export function Tabs<V extends string>({ label, tabs, value, onValueChange, children, countLabel }: TabsProps<V>) {
  return (
    <BaseTabs.Root value={value} onValueChange={(next) => onValueChange(next as V)} className="flex flex-col gap-6">
      <BaseTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-divider-default">
        {tabs.map((tab) => (
          <BaseTabs.Tab
            key={tab.value}
            value={tab.value}
            className={cn(
              'inline-flex min-h-12 shrink-0 items-center gap-2 border-b-4 border-transparent px-4 text-sm whitespace-nowrap text-text-subdued',
              'hover:text-text-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus',
              'data-active:border-button-primary-border data-active:font-semibold data-active:text-text-default',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                aria-label={countLabel?.(tab.count)}
                className="rounded-full bg-button-primary-surface px-2 text-xs font-semibold text-button-primary-text"
              >
                {tab.count}
              </span>
            )}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      <BaseTabs.Panel value={value} className="outline-none">
        {children}
      </BaseTabs.Panel>
    </BaseTabs.Root>
  )
}
