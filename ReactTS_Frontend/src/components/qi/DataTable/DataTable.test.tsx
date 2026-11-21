import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DataTable, type DataTableColumn } from './DataTable'

interface App {
  id: string
  name: string
  owner: string
  criticality: number
}

const rows: App[] = [
  { id: '1', name: 'Policy Admin', owner: 'Core', criticality: 1 },
  { id: '2', name: 'Agent Portal', owner: 'Digital', criticality: 3 },
  { id: '3', name: 'Claims Hub', owner: 'Core', criticality: 2 },
]

const columns: DataTableColumn<App>[] = [
  { id: 'name', header: 'Application', accessor: (row) => row.name, sortable: true },
  { id: 'owner', header: 'Owner', accessor: (row) => row.owner },
  {
    id: 'criticality',
    header: 'Criticality',
    accessor: (row) => row.criticality,
    sortable: true,
    cell: (row) => `Tier ${row.criticality}`,
  },
]

function bodyRowNames(): string[] {
  const [, body] = screen.getAllByRole('rowgroup')
  return within(body)
    .getAllByRole('row')
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

describe('DataTable', () => {
  it('renders a captioned table with column headers and rows', () => {
    render(<DataTable caption="Business applications" columns={columns} rows={rows} getRowId={(r) => r.id} />)

    expect(screen.getByRole('table', { name: 'Business applications' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Application',
      'Owner',
      'Criticality',
    ])
    expect(screen.getByText('Tier 3')).toBeInTheDocument()
  })

  it('sorts ascending then descending when a sortable header is activated', async () => {
    const user = userEvent.setup()
    render(<DataTable caption="Apps" columns={columns} rows={rows} getRowId={(r) => r.id} />)
    const header = screen.getByRole('columnheader', { name: /Application/ })

    expect(header).toHaveAttribute('aria-sort', 'none')
    await user.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(bodyRowNames()).toEqual(['Agent Portal', 'Claims Hub', 'Policy Admin'])

    await user.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(bodyRowNames()).toEqual(['Policy Admin', 'Claims Hub', 'Agent Portal'])
  })

  it('sorts numeric columns by value, not by rendered text', async () => {
    const user = userEvent.setup()
    render(<DataTable caption="Apps" columns={columns} rows={rows} getRowId={(r) => r.id} />)

    await user.click(within(screen.getByRole('columnheader', { name: /Criticality/ })).getByRole('button'))

    expect(bodyRowNames()).toEqual(['Policy Admin', 'Claims Hub', 'Agent Portal'])
  })

  it('does not offer sorting on non-sortable columns', () => {
    render(<DataTable caption="Apps" columns={columns} rows={rows} getRowId={(r) => r.id} />)
    const owner = screen.getByRole('columnheader', { name: 'Owner' })
    expect(within(owner).queryByRole('button')).not.toBeInTheDocument()
    expect(owner).not.toHaveAttribute('aria-sort')
  })

  it('renders display-only columns (actions) without a value or sorting', async () => {
    const withActions: DataTableColumn<App>[] = [
      ...columns,
      { id: 'actions', header: 'Actions', cell: (row) => <button type="button">Open {row.name}</button> },
    ]
    render(<DataTable caption="Apps" columns={withActions} rows={rows} getRowId={(r) => r.id} />)

    expect(screen.getByRole('columnheader', { name: 'Actions' })).not.toHaveAttribute('aria-sort')
    expect(within(screen.getByRole('columnheader', { name: 'Actions' })).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Claims Hub' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Application' }))
    expect(bodyRowNames()).toEqual(['Agent Portal', 'Claims Hub', 'Policy Admin'])
  })

  it('wraps the table in a focusable, labelled region so keyboard users can scroll it', () => {
    render(<DataTable caption="Business applications" hideCaption columns={columns} rows={rows} getRowId={(r) => r.id} />)

    const region = screen.getByRole('region', { name: 'Business applications' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(within(region).getByRole('table', { name: 'Business applications' })).toBeInTheDocument()
  })

  it('shows the empty state when there are no rows', () => {
    render(
      <DataTable
        caption="Apps"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        emptyState={<p>No applications found</p>}
      />,
    )
    expect(screen.getByText('No applications found')).toBeInTheDocument()
  })

  it('applies striped rows when requested', () => {
    render(<DataTable caption="Apps" columns={columns} rows={rows} getRowId={(r) => r.id} striped />)
    expect(screen.getByRole('table')).toHaveAttribute('data-striped', 'true')
  })
})
