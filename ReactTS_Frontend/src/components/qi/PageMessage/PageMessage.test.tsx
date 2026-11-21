import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button/Button'
import { PageMessage, type PageMessageVariant } from './PageMessage'

describe('PageMessage', () => {
  it.each<[PageMessageVariant, 'alert' | 'status']>([
    ['error', 'alert'],
    ['warning', 'alert'],
    ['informative', 'status'],
    ['success', 'status'],
  ])('announces the %s variant as a %s', (variant, role) => {
    render(
      <PageMessage variant={variant} title="Heads up">
        Details
      </PageMessage>,
    )

    const message = screen.getByRole(role)
    expect(message).toHaveAttribute('data-variant', variant)
    expect(message).toHaveTextContent('Heads up')
    expect(message).toHaveTextContent('Details')
  })

  it('defaults to informative and renders without a title', () => {
    render(<PageMessage>You have signed out.</PageMessage>)

    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'informative')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('labels the region with its title and keeps the single action keyboard reachable', () => {
    render(
      <PageMessage variant="error" title="Sign-in failed" action={<Button>Try again</Button>}>
        Please try again.
      </PageMessage>,
    )

    expect(screen.getByRole('alert', { name: 'Sign-in failed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('passes through extra attributes and classes', () => {
    render(
      <PageMessage data-testid="msg" className="mt-4">
        Text
      </PageMessage>,
    )

    expect(screen.getByTestId('msg')).toHaveClass('mt-4')
  })

  it('renders in the dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<PageMessage variant="warning">Text</PageMessage>)

    expect(screen.getByRole('alert')).toBeVisible()
  })
})
