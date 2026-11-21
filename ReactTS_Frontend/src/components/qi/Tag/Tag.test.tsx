import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tag, type TagEmphasis } from './Tag'

describe('Tag', () => {
  it.each<TagEmphasis>(['default', 'medium', 'high', 'new'])('renders the %s emphasis as plain, non-interactive text', (emphasis) => {
    render(<Tag emphasis={emphasis}>Vendor</Tag>)

    const tag = screen.getByText('Vendor')
    expect(tag).toHaveAttribute('data-emphasis', emphasis)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('defaults to low emphasis and accepts extra classes', () => {
    render(<Tag className="ml-2">System</Tag>)

    expect(screen.getByText('System')).toHaveAttribute('data-emphasis', 'default')
    expect(screen.getByText('System')).toHaveClass('ml-2')
  })
})
