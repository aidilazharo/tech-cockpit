import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('is a labelled multi-line field with its hint', async () => {
    render(<Textarea label="Comment" labelSuffix="(optional)" hint="The requester sees this" />)

    const box = screen.getByRole('textbox', { name: 'Comment (optional)' })
    expect(box.tagName).toBe('TEXTAREA')
    expect(box).toHaveAttribute('rows', '4')
    expect(box).toHaveAccessibleDescription('The requester sees this')
    await userEvent.type(box, 'Line one{Enter}Line two')
    expect(box).toHaveValue('Line one\nLine two')
  })

  it('links an error and can be disabled', () => {
    render(<Textarea label="Reason" error="Enter a reason" disabled />)

    expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveAccessibleDescription('Enter a reason')
    expect(screen.getByRole('textbox', { name: 'Reason' })).toBeDisabled()
  })
})
