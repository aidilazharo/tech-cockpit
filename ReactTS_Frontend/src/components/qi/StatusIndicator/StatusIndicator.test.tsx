import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusIndicator, type StatusTone } from './StatusIndicator'

describe('StatusIndicator', () => {
  it.each<StatusTone>(['positive', 'attention', 'negative', 'informative', 'ended'])(
    'shows the %s status with an icon and a text label',
    (tone) => {
      const { container } = render(<StatusIndicator tone={tone}>Active</StatusIndicator>)

      const status = screen.getByText('Active').closest('[data-tone]')
      expect(status).toHaveAttribute('data-tone', tone)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    },
  )

  it('is read-only text, never a control', () => {
    render(<StatusIndicator tone="positive">Approved</StatusIndicator>)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeVisible()
  })
})
