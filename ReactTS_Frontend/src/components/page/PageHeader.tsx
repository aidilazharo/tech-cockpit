import type { ReactNode } from 'react'

/** Page title with optional intro text and actions (one primary action at most). */
export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="heading-1">{title}</h1>
        {intro && <p className="text-text-subdued">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
