import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it.each(['primary', 'secondary', 'tertiary'] as const)(
    'renders the %s variant as an accessible button',
    (variant) => {
      render(<Button variant={variant}>Submit</Button>)
      const button = screen.getByRole('button', { name: 'Submit' })
      expect(button).toHaveAttribute('data-variant', variant)
      expect(button).toHaveAttribute('type', 'button')
    },
  )

  it('defaults to the primary variant and medium size', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button).toHaveAttribute('data-size', 'md')
  })

  it('activates with mouse, Enter and Space', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Approve</Button>)

    const button = screen.getByRole('button', { name: 'Approve' })
    await user.click(button)
    button.blur()
    await user.tab()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('cannot be activated when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Approve
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('shows a busy state and blocks clicks while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Submit' })

    await user.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders start and end icons and an underlined tertiary link style', () => {
    render(
      <Button
        variant="tertiary"
        underline
        size="lg"
        iconStart={<svg data-testid="start" />}
        iconEnd={<svg data-testid="end" />}
      >
        Download
      </Button>,
    )
    expect(screen.getByTestId('start')).toBeInTheDocument()
    expect(screen.getByTestId('end')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' }).className).toContain('underline')
  })

  it('can submit a form when type="submit"', () => {
    render(<Button type="submit">Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })
})
