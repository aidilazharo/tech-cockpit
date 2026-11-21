import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchSelect } from './SearchSelect'

interface Person {
  id: string
  name: string
  email: string
}

const PEOPLE: Person[] = [
  { id: '1', name: 'Ana Lim', email: 'ana@aia.com' },
  { id: '2', name: 'Rajesh Kumar', email: 'rajesh@aia.com' },
]

function Harness({ onQuery = () => {}, error, disabled }: { onQuery?: (q: string) => void; error?: string; disabled?: boolean }) {
  const [value, setValue] = useState<Person | null>(null)
  const [query, setQuery] = useState('')
  const items = PEOPLE.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <SearchSelect<Person>
        label="Delegate"
        placeholder="Type a name"
        value={value}
        onValueChange={setValue}
        items={items}
        onQueryChange={(q) => {
          setQuery(q)
          onQuery(q)
        }}
        itemKey={(p) => p.id}
        itemLabel={(p) => p.name}
        itemDescription={(p) => p.email}
        emptyText="No one found"
        hint="Someone who approves while you are away"
        error={error}
        disabled={disabled}
      />
      <p>Chosen: {value?.name ?? 'nobody'}</p>
    </>
  )
}

describe('SearchSelect', () => {
  // First on purpose: Base UI logs each warning once per file, so an earlier render would use it up.
  it('labels the input with a real label, so clicking the label focuses it and Base UI has nothing to warn about', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<Harness />)

      await userEvent.click(screen.getByText('Delegate'))

      expect(screen.getByRole('combobox', { name: 'Delegate' })).toHaveFocus()
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it('is a labelled combobox with a hint', () => {
    render(<Harness />)

    expect(screen.getByRole('combobox', { name: 'Delegate' })).toHaveAccessibleDescription('Someone who approves while you are away')
  })

  it('searches as you type and chooses an option with its description', async () => {
    const onQuery = vi.fn()
    render(<Harness onQuery={onQuery} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Delegate' }), 'raj')
    const option = await screen.findByRole('option', { name: /Rajesh Kumar/ })
    expect(option).toHaveTextContent('rajesh@aia.com')
    expect(screen.queryByRole('option', { name: /Ana Lim/ })).not.toBeInTheDocument()
    await userEvent.click(option)

    expect(onQuery).toHaveBeenCalledWith('raj')
    expect(screen.getByText('Chosen: Rajesh Kumar')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('Rajesh Kumar')
  })

  it('chooses with the keyboard', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Delegate' }), 'an')
    await screen.findByRole('option', { name: /Ana Lim/ })
    await userEvent.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(screen.getByText('Chosen: Ana Lim')).toBeInTheDocument())
  })

  it('says when nothing matches', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Delegate' }), 'zzz')

    expect(await screen.findByText('No one found')).toBeInTheDocument()
  })

  it('shows an error and can be disabled', () => {
    const { unmount } = render(<Harness error="Choose a delegate" />)
    expect(screen.getByRole('combobox', { name: 'Delegate' })).toHaveAccessibleDescription(/Choose a delegate/)
    unmount()

    render(<Harness disabled />)
    expect(screen.getByRole('combobox', { name: 'Delegate' })).toBeDisabled()
  })
})
