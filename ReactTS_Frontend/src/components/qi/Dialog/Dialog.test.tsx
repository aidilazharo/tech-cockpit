import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../Button/Button'
import { Dialog } from './Dialog'

function Harness({
  variant,
  dismissible,
  onConfirm = () => {},
}: {
  variant?: 'default' | 'alert'
  dismissible?: boolean
  onConfirm?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Delete draft</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant={variant}
        dismissible={dismissible}
        closeLabel="Close"
        title="Delete this draft?"
        description="This cannot be undone."
        actions={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>Business case BC-001</p>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('opens with a title and description that name the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Delete draft' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete this draft?' })
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
    expect(screen.getByText('Business case BC-001')).toBeInTheDocument()
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Delete draft' })

    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('closes with the close button when dismissible', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await user.click(await screen.findByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('runs the confirm action', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('uses role="alertdialog" without a close button for alert dialogs', async () => {
    const user = userEvent.setup()
    render(<Harness variant="alert" />)

    await user.click(screen.getByRole('button', { name: 'Delete draft' }))

    expect(await screen.findByRole('alertdialog', { name: 'Delete this draft?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('hides the close button when not dismissible', async () => {
    const user = userEvent.setup()
    render(<Harness dismissible={false} />)

    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await screen.findByRole('dialog')

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
