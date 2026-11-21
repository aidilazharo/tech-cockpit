import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ButtonLink } from './ButtonLink'

describe('ButtonLink', () => {
  it('is a link styled as a Qi button, with hover styles that work on links', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/trm/roadmap/new">New initiative</ButtonLink>
        <ButtonLink to="/edit" variant="secondary" size="lg" className="w-fit">
          Edit
        </ButtonLink>
      </MemoryRouter>,
    )
    const primary = screen.getByRole('link', { name: 'New initiative' })
    expect(primary).toHaveAttribute('href', '/trm/roadmap/new')
    expect(primary).toHaveAttribute('data-variant', 'primary')
    expect(primary.className).toContain('hover:bg-button-primary-surface-hover')
    expect(primary.className).not.toContain('hover:enabled:')
    const secondary = screen.getByRole('link', { name: 'Edit' })
    expect(secondary.className).toContain('bg-button-secondary-surface')
    expect(secondary.className).toContain('min-h-12')
    expect(secondary.className).toContain('w-fit')
  })
})
