import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type RowData,
} from '@tanstack/react-table'
import { useId, useMemo, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { SortIcon } from '../icons'

interface ColumnBase {
  id: string
  header: string
}

/** A column with a value: displayed (or rendered by `cell`) and optionally sortable. */
export interface DataColumn<T extends RowData> extends ColumnBase {
  /** Value used for sorting (and display when no `cell` is given). */
  accessor: (row: T) => string | number
  cell?: (row: T) => ReactNode
  sortable?: boolean
}

/** A column with rendered content only (actions, badges): never sortable. */
export interface DisplayColumn<T extends RowData> extends ColumnBase {
  accessor?: undefined
  cell: (row: T) => ReactNode
  sortable?: false
}

export type DataTableColumn<T extends RowData> = DataColumn<T> | DisplayColumn<T>

export interface DataTableProps<T extends RowData> {
  /** Accessible name of the table (Qi: every table needs a header row and labelling). */
  caption: string
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  striped?: boolean
  emptyState?: ReactNode
  /** Visually hide the caption when the page heading already labels the table. */
  hideCaption?: boolean
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

/** Qi table rendered from TanStack Table (headless): sorting, empty state, striped rows. */
export function DataTable<T extends RowData>({
  caption,
  columns,
  rows,
  getRowId,
  striped = false,
  emptyState,
  hideCaption = false,
}: DataTableProps<T>) {
  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns])
  const columnDefs = useMemo(() => {
    const helper = createColumnHelper<typeof features, T>()
    return helper.columns(
      columns.map((column) =>
        column.accessor
          ? helper.accessor(column.accessor, {
              id: column.id,
              header: column.header,
              enableSorting: Boolean(column.sortable),
            })
          : helper.display({ id: column.id, header: column.header, enableSorting: false }),
      ),
    )
  }, [columns])

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows,
    getRowId: (row) => getRowId(row),
    sortDescFirst: false,
  })

  const bodyRows = table.getRowModel().rows
  const captionId = useId()

  return (
    // Wide tables scroll sideways; the region is focusable so keyboard users can scroll it too.
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="overflow-x-auto rounded-card border border-divider-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      <table className="w-full border-collapse text-left text-sm" data-striped={striped || undefined}>
        <caption id={captionId} className={cn('px-4 py-3 text-left font-semibold', hideCaption && 'sr-only')}>
          {caption}
        </caption>
        <thead className="bg-surface-alternate">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const column = byId.get(header.column.id)!
                const sorted = header.column.getIsSorted()
                if (!header.column.getCanSort()) {
                  return (
                    <th key={header.id} scope="col" className="border-b border-divider-bold px-4 py-3 font-semibold">
                      {column.header}
                    </th>
                  )
                }
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted ? ARIA_SORT[sorted] : 'none'}
                    className="border-b border-divider-bold px-2 py-1 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex min-h-10 items-center gap-1 rounded-sm px-2 hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-border-focus"
                    >
                      {column.header}
                      <SortIcon sort={sorted} />
                    </button>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {bodyRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-subdued">
                {emptyState}
              </td>
            </tr>
          ) : (
            bodyRows.map((row) => (
              <tr
                key={row.id}
                className={cn('border-b border-divider-default last:border-b-0', striped && 'even:bg-surface-alternate')}
              >
                {row.getAllCells().map((cell) => {
                  const column = byId.get(cell.column.id)!
                  return (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {column.cell ? column.cell(row.original) : column.accessor?.(row.original)}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
