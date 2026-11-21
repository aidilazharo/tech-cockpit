import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'
import { pageItems } from './page-items'

const labels = { label: 'Users pages', previous: 'Previous page', next: 'Next page', page: (n: number) => `Page ${n}` }

describe('pageItems', () => {
  it.each([
    [1, 1, [1]],
    [3, 5, [1, 2, 3, 4, 5]],
    [1, 10, [1, 2, 'gap', 10]],
    [5, 10, [1, 'gap', 4, 5, 6, 'gap', 10]],
    [10, 10, [1, 'gap', 9, 10]],
  ])('page %i of %i shows %j', (page, count, expected) => {
    expect(pageItems(page, count)).toEqual(expected)
  })
})

describe('Pagination', () => {
  it('is a labelled navigation that marks the current page', () => {
    render(<Pagination page={2} pageCount={3} onPageChange={() => {}} labels={labels} />)

    const nav = screen.getByRole('navigation', { name: 'Users pages' })
    expect(within(nav).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current')
  })

  it('moves with the chevrons and page numbers', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} pageCount={3} onPageChange={onPageChange} labels={labels} />)

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }))

    expect(onPageChange.mock.calls).toEqual([[1], [3], [3]])
  })

  it('keeps showing a single page but disables both chevrons (Qi)', () => {
    render(<Pagination page={1} pageCount={1} onPageChange={() => {}} labels={labels} />)

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
  })

  it('treats zero results as one page', () => {
    render(<Pagination page={1} pageCount={0} onPageChange={() => {}} labels={labels} />)

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
})
