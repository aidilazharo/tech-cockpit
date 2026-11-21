import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichText } from './RichText'

const text = (value: string, marks?: object[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const cell = (type: string, value: string) => ({ type, content: [{ type: 'paragraph', content: [text(value)] }] })

describe('RichText', () => {
  it('shows headings, underline, strikethrough, font sizes and tables from the stored tree', () => {
    render(
      <RichText
        doc={{
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 4 }, content: [text('Overview')] },
            { type: 'heading', attrs: { level: 5 }, content: [text('Front end')] },
            { type: 'paragraph', content: [text('under', [{ type: 'underline' }]), text('struck', [{ type: 'strike' }]), text('small', [{ type: 'textStyle', attrs: { fontSize: 'small' } }]), text('large', [{ type: 'textStyle', attrs: { fontSize: 'large' } }])] },
            { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Service'), cell('tableHeader', 'Tier')] }, { type: 'tableRow', content: [cell('tableCell', 'App Service'), cell('tableCell', 'P1v3')] }] },
          ],
        }}
      />,
    )
    expect(screen.getByRole('heading', { level: 4, name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 5, name: 'Front end' })).toBeInTheDocument()
    expect(screen.getByText('under').tagName).toBe('U')
    expect(screen.getByText('struck').tagName).toBe('S')
    expect(screen.getByText('small')).toHaveClass('text-sm')
    expect(screen.getByText('large')).toHaveClass('text-lg')
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Service', 'Tier'])
    expect(within(table).getAllByRole('cell').map((c) => c.textContent)).toEqual(['App Service', 'P1v3'])
  })
})
