import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem } from '../../../test/harness'
import type { Diagram, DiagramContent, DiagramSlot, Upload } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'
import { emptyContent } from './model'

vi.mock('./DiagramCanvas', () => ({ DiagramCanvas: ({ diagram }: { diagram: Diagram }) => <p>{`Canvas: ${diagram.title}`}</p> }))

const VERSION = '7b000000-0000-4000-8000-000000000001'
const LIST = `GET /api/v1/sad/versions/${VERSION}/uploads`
const upload = (id: number, overrides: Partial<Upload> = {}): Upload => ({
  id: `90000000-0000-4000-8000-00000000000${id}`,
  slot: 'solution',
  diagramId: 'solution',
  name: `file-${id}.pdf`,
  type: 'pdf',
  size: 1_258_291,
  scan: 'unscanned',
  uploadedBy: { id: '00000000-0000-4000-8000-000000000002', name: 'Ada Lead' },
  uploadedAt: '2026-10-24T02:00:00.000Z',
  ...overrides,
})

let api: ReturnType<typeof mockApi>
let items: Upload[]
beforeEach(() => {
  api = mockApi()
  items = []
  api.on(LIST, () => json(200, { items }))
})

let latest: DiagramContent | undefined
beforeEach(() => {
  latest = undefined
})
function Harness({ slot, initial, editable, saved }: { slot: DiagramSlot; initial: DiagramContent; editable: boolean; saved: string[] }) {
  const [content, setContent] = useState(initial)
  return (
    <DiagramSlotEditor
      slot={slot}
      content={content}
      onChange={
        editable
          ? (next) => {
              latest = next
              setContent(next)
            }
          : undefined
      }
      drawnIn={editable ? undefined : 'Solution & Integration Architecture'}
      versionId={VERSION}
      application="CRM"
      savedDiagramIds={saved}
    />
  )
}
const show = (slot: DiagramSlot, { editable = true, saved, initial = emptyContent(slot, 'CRM') }: { editable?: boolean; saved?: string[]; initial?: DiagramContent } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness slot={slot} initial={initial} editable={editable} saved={saved ?? ('notApplicable' in initial ? [] : initial.diagrams.map((d) => d.id))} />
    </QueryClientProvider>,
  )
const files = () => screen.findByRole('table', { name: /^Files/ })
const rows = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
const choose = (file: File) => userEvent.upload(screen.getByLabelText('Add a file'), file, { applyAccept: false })

describe('files under a diagram, for its readers', () => {
  it('lists the files under the diagram on screen, downloadable once allowed, with who added them when the reader may see it', async () => {
    items = [
      upload(1),
      upload(2, { name: 'scan.png', type: 'png', size: 2048, scan: 'scanning', uploadedBy: null }),
      upload(3, { name: 'invoice.pdf', size: 900, scan: 'malicious' }),
      upload(4, { name: 'odd.pdf', size: 10, scan: 'failed' }),
      upload(5, { name: 'clean.docx', type: 'docx', size: 30_000, scan: 'clean' }),
      upload(6, { slot: 'infrastructure', diagramId: 'production', name: 'network.png' }),
    ]
    show('solution', { editable: false })
    const table = await files()
    expect(table).toHaveAccessibleName('Files (5 of 20)')
    expect(rows(table)).toEqual([
      ['file-1.pdf', 'PDF', '1.2 MB', 'Ada Lead', '24 Oct 2026', '—'],
      ['scan.png', 'PNG', '2 KB', 'Restricted', '24 Oct 2026', 'Being checked for malware'],
      ['invoice.pdf', 'PDF', '900 B', 'Ada Lead', '24 Oct 2026', 'Blocked: malware found'],
      ['odd.pdf', 'PDF', '10 B', 'Ada Lead', '24 Oct 2026', 'Could not be checked for malware'],
      ['clean.docx', 'DOCX', '29 KB', 'Ada Lead', '24 Oct 2026', '—'],
    ])
    expect(within(table).getByRole('link', { name: 'file-1.pdf' })).toHaveAttribute('href', `/api/v1/sad/versions/${VERSION}/uploads/${upload(1).id}/file`)
    expect(within(table).queryByRole('link', { name: 'scan.png' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: 'invoice.pdf' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a file')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('says when there are none, and when they cannot be loaded', async () => {
    const { unmount } = show('solution', { editable: false })
    expect(await screen.findByText('No files under this diagram.')).toBeInTheDocument()
    unmount()
    api.on(LIST, problem(500, 'Server error'))
    show('solution', { editable: false })
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(api.callsTo(LIST).length).toBeGreaterThan(2)
  })
})

describe('files under a diagram, for the editors who draw it', () => {
  const POST = `POST /api/v1/sad/versions/${VERSION}/diagrams/solution/solution/uploads`

  it('adds a file at once, after checking its kind and size, and shows what the API refuses', async () => {
    api.on(POST, (call) => {
      expect((call.body as FormData).get('file')).toMatchObject({ name: 'design.pdf' })
      items = [upload(1, { name: 'design.pdf' })]
      return json(201, items[0])
    })
    show('solution')
    await files()
    expect(screen.getByText('Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io; up to 25 MB each, 20 a diagram.')).toBeInTheDocument()
    await choose(new File(['MZ'], 'tool.exe'))
    expect(await screen.findByText('Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.')).toBeInTheDocument()
    await choose(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'huge.pdf'))
    expect(await screen.findByText('Files must be 25 MB or smaller.')).toBeInTheDocument()
    expect(api.callsTo(POST)).toHaveLength(0)

    await choose(new File(['%PDF-1.7'], 'design.pdf'))
    expect(await within(await files()).findByRole('link', { name: 'design.pdf' })).toBeInTheDocument()
    expect(screen.getByText('Added design.pdf.')).toBeInTheDocument()

    api.on(POST, json(400, { type: 'about:blank', title: 'Bad Request', status: 400, errors: [{ path: 'file', message: 'This file is not really a PDF file.' }] }))
    await choose(new File(['MZ'], 'invoice.pdf'))
    expect(await screen.findByText('This file is not really a PDF file.')).toBeInTheDocument()
    api.on(POST, problem(409, 'Conflict', 'A diagram holds up to 20 files.'))
    await choose(new File(['%PDF-1.7'], 'late.pdf'))
    expect(await screen.findByText('A diagram holds up to 20 files.')).toBeInTheDocument()
    api.on(POST, problem(413, 'Payload Too Large', 'File too large'))
    await choose(new File(['%PDF-1.7'], 'big.pdf'))
    expect(await screen.findByText('Files must be 25 MB or smaller.')).toBeInTheDocument()
    api.on(POST, problem(500, 'Server error'))
    await choose(new File(['%PDF-1.7'], 'again.pdf'))
    expect(await screen.findByText('Server error')).toBeInTheDocument()
    api.on(POST, () => {
      throw new TypeError('Failed to fetch')
    })
    await choose(new File(['%PDF-1.7'], 'offline.pdf'))
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument()
    // A name without an extension, and choosing nothing.
    await choose(new File(['x'], 'README'))
    expect(await screen.findByText('Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.')).toBeInTheDocument()
    const posts = api.callsTo(POST).length
    // Cancelling the file dialog sends a change with no file.
    fireEvent.change(screen.getByLabelText('Add a file'), { target: { files: [] } })
    expect(api.callsTo(POST)).toHaveLength(posts)
  })

  it('removes a file at once', async () => {
    items = [upload(1), upload(2)]
    const DELETE = `DELETE /api/v1/sad/versions/${VERSION}/uploads/${upload(1).id}`
    api.on(DELETE, () => {
      items = [upload(2)]
      return new Response(null, { status: 204 })
    })
    show('solution')
    await userEvent.click(within(await files()).getByRole('button', { name: 'Remove file-1.pdf' }))
    await within(await files()).findByRole('link', { name: 'file-2.pdf' })
    expect(within(await files()).queryByRole('link', { name: 'file-1.pdf' })).not.toBeInTheDocument()
    expect(api.callsTo(DELETE)).toHaveLength(1)
    api.on(`DELETE /api/v1/sad/versions/${VERSION}/uploads/${upload(2).id}`, problem(409, 'Conflict', 'Only a draft can be edited.'))
    await userEvent.click(within(await files()).getByRole('button', { name: 'Remove file-2.pdf' }))
    expect(await screen.findByText('Only a draft can be edited.')).toBeInTheDocument()
  })

  it('asks for a new diagram to be saved first, and stops at 20 files', async () => {
    const { unmount } = show('solution', { saved: [] })
    expect(await screen.findByText('Save the section first to add files to this diagram.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a file')).not.toBeInTheDocument()
    unmount()
    items = Array.from({ length: 20 }, (_, i) => upload(1, { id: `90000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}` }))
    show('solution')
    expect(await screen.findByText('This diagram holds 20 files, the most it can.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a file')).not.toBeInTheDocument()
  })

  it('asks before removing a diagram that has files, or answering Does not apply for a slot with files', async () => {
    items = [upload(1, { slot: 'ci-cd', diagramId: 'diagram-1', name: 'cd.pdf' }), upload(2, { slot: 'ci-cd', diagramId: 'diagram-1', name: 'cab.pdf' })]
    const two = { diagrams: [{ ...emptyContent('ci-cd').diagrams[0], title: 'CI flow' }, { ...emptyContent('ci-cd').diagrams[0], id: 'diagram-1', title: 'CD flow' }] }
    show('ci-cd', { initial: two })
    await userEvent.click(screen.getByRole('tab', { name: 'CD flow' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove this diagram' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove “CD flow” and its 2 files?' })
    expect(dialog).toHaveTextContent('Its files are removed when you save the section.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Remove this diagram' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect((latest as { diagrams: Diagram[] }).diagrams.map((d) => d.title)).toEqual(['CI flow'])

    // The CI flow has no files: removing it asks nothing (and Does not apply neither).
    latest = undefined
    await userEvent.click(screen.getByRole('button', { name: 'Add diagram' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove this diagram' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks before Does not apply when the slot has files', async () => {
    items = [upload(1)]
    show('solution')
    await files()
    await userEvent.click(screen.getByRole('radio', { name: 'Does not apply' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Answer Does not apply and remove 1 file?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest).toBeUndefined()
    await userEvent.click(screen.getByRole('radio', { name: 'Does not apply' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Does not apply' }))
    expect(latest).toMatchObject({ notApplicable: true })
  })
})
