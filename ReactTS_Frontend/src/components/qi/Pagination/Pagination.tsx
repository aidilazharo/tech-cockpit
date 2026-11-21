import { cn } from '../../../lib/cn'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { pageItems } from './page-items'

export interface PaginationLabels {
  /** Accessible name of the navigation, e.g. "Users pages". */
  label: string
  previous: string
  next: string
  page: (page: number) => string
}

export interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  labels: PaginationLabels
  className?: string
}

const BUTTON = cn(
  'inline-flex size-10 items-center justify-center rounded-button text-sm text-text-default',
  'hover:enabled:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
  'disabled:cursor-not-allowed disabled:text-text-disabled',
)

/** Qi pagination: page numbers with previous/next chevrons. One per page (Qi). */
export function Pagination({ page, pageCount, onPageChange, labels, className }: PaginationProps) {
  const count = Math.max(1, pageCount)
  return (
    <nav aria-label={labels.label} className={cn('flex items-center gap-1', className)}>
      <button type="button" className={BUTTON} aria-label={labels.previous} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeftIcon />
      </button>
      {pageItems(page, count).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-text-subdued">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={cn(BUTTON, item === page && 'bg-button-primary-surface font-semibold text-button-primary-text hover:enabled:bg-button-primary-surface-hover')}
            aria-label={labels.page(item)}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className={BUTTON} aria-label={labels.next} disabled={page >= count} onClick={() => onPageChange(page + 1)}>
        <ChevronRightIcon />
      </button>
    </nav>
  )
}
