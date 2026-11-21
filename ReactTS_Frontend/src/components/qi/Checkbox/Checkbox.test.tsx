import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

function Controlled({ onChange = () => {} }: { onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false)
  return (
    <Checkbox
      label="View roles"
      description="access:role:read"
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next)
        onChange(next)
      }}
    />
  )
}

describe('Checkbox', () => {
  it('is a labelled checkbox with its description', () => {
    render(<Controlled />)

    const box = screen.getByRole('checkbox', { name: 'View roles' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    expect(box).toHaveAccessibleDescription('access:role:read')
  })

  it('toggles by clicking the box or the label', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.click(screen.getByText('View roles'))
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('checkbox'))

    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('toggles with the Space key', async () => {
    render(<Controlled />)
    screen.getByRole('checkbox').focus()

    await userEvent.keyboard(' ')

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })

  it('announces and ignores a disabled checkbox', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Locked" checked={false} onCheckedChange={onCheckedChange} disabled />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Locked' }))

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true')
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('renders in the dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<Checkbox label="Dark" checked onCheckedChange={() => {}} />)

    expect(screen.getByRole('checkbox', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  })
})
