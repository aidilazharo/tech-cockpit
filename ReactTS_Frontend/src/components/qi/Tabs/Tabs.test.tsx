import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

type View = 'waiting' | 'mine' | 'done'

function Harness() {
  const [view, setView] = useState<View>('waiting')
  return (
    <Tabs<View>
      label="Approval views"
      value={view}
      onValueChange={setView}
      countLabel={(n) => `${n} waiting`}
      tabs={[
        { value: 'waiting', label: 'Waiting for me', count: 3 },
        { value: 'mine', label: 'My requests', count: 0 },
        { value: 'done', label: 'Done by me' },
      ]}
    >
      <p>Showing {view}</p>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('labels the tab list, selects one tab and shows its panel', () => {
    render(<Harness />)

    expect(screen.getByRole('tablist', { name: 'Approval views' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Waiting for me/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Showing waiting')
    expect(screen.getByLabelText('3 waiting')).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: 'My requests' })).not.toHaveTextContent('0')
  })

  it('switches by click and with the arrow keys', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Done by me' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Showing done')

    screen.getByRole('tab', { name: 'Done by me' }).focus()
    await userEvent.keyboard('{ArrowLeft}{Enter}')
    expect(screen.getByRole('tab', { name: 'My requests' })).toHaveFocus()
  })
})
