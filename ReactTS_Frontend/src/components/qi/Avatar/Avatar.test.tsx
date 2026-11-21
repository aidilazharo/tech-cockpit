import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it.each([
    ['Test Admin', 'TA'],
    ['  ana   lim  ', 'AL'],
    ['Siti Nur Aisyah', 'SA'],
    ['Madonna', 'M'],
    ['', '?'],
  ])('turns %j into %j', (name, initials) => {
    expect(initialsOf(name)).toBe(initials)
  })
})

describe('Avatar', () => {
  it('shows initials and is announced by name', () => {
    render(<Avatar name="Test Admin" />)

    const avatar = screen.getByRole('img', { name: 'Test Admin' })
    expect(avatar).toHaveTextContent('TA')
    expect(avatar).toHaveAttribute('data-size', 'md')
  })

  it('is hidden from assistive technology when decorative (the control carries the name)', () => {
    render(
      <button type="button" aria-label="Account menu">
        <Avatar name="Test Admin" decorative />
      </button>,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('TA')
  })

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    render(<Avatar name="Ana Lim" size={size} />)

    expect(screen.getByRole('img')).toHaveAttribute('data-size', size)
  })

  it('falls back to initials while a photo has not loaded', () => {
    render(<Avatar name="Ana Lim" src="https://example.com/ana.png" />)

    expect(screen.getByRole('img', { name: 'Ana Lim' })).toHaveTextContent('AL')
  })

  it('renders in the dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<Avatar name="Ana Lim" tone="secondary-3" />)

    expect(screen.getByRole('img')).toBeVisible()
  })
})
