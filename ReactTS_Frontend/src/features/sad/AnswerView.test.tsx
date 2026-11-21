import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type AnswerContext, AnswerView } from './AnswerView'
import type { Answer, Question, TrmData } from './schemas'

const trm: TrmData = {
  values: {
    name: 'CRM',
    environment: [
      { name: null, environment: null, servers: [], software: [] },
      { name: 'CRM Prod', environment: 'Production', servers: ['srv-1'], software: [{ name: 'Nginx', version: null, standard: 'Nginx', standardStatus: null }] },
    ],
  },
  restricted: [],
  live: true,
}

const show = (question: Question, answer?: Answer, context: AnswerContext = { trm, retention: [] }) => {
  const { container } = render(<AnswerView question={question} answer={answer} context={context} />)
  return container
}

describe('AnswerView', () => {
  it('shows TRM values, the environment, and a fallback answer when TRM holds nothing', () => {
    expect(show({ type: 'trm', key: 'n', label: 'Name', source: 'name' })).toHaveTextContent('CRM')
    expect(show({ type: 'trm', key: 'e', label: 'Env', source: 'environment', fallback: { type: 'none' } })).toHaveTextContent('———CRM ProdProductionsrv-1Nginx (Nginx)')
    expect(show({ type: 'trm', key: 'e2', label: 'Env', source: 'environment' }, undefined, { trm: null, retention: [] })).toHaveTextContent('TRM has no application services')
    expect(show({ type: 'trm', key: 's', label: 'Entity', source: 'ownedBusinessUnit' }, { value: 'AIA Bhd' })).toHaveTextContent('AIA Bhd')
    expect(show({ type: 'trm', key: 'd', label: 'Class', source: 'dataClassification', fallback: { type: 'choice', options: [{ value: 'internal', label: 'Internal' }] } }, { value: { selected: 'internal' } })).toHaveTextContent('Internal')
    expect(show({ type: 'trm', key: 'd2', label: 'Class', source: 'dataClassification' }, { value: { selected: 'gone' } })).toHaveTextContent('gone')
    expect(show({ type: 'trm', key: 'b', label: 'Owner', source: 'businessOwner' }, undefined, { trm: { ...trm, restricted: ['businessOwner'] }, retention: [] })).toHaveTextContent('Restricted')
  })

  it('shows typed owners by name, and each data object with its key attributes', () => {
    const table = show(
      { type: 'table', key: 'apis', label: 'APIs', addRows: true, columns: [{ key: 'owner', label: 'Owner', type: 'person', personal: true }, { key: 'data', label: 'Data', type: 'dataObjects' }] },
      { value: [{ cells: { owner: { name: 'Vendor support desk' }, data: [{ object: 'Policy', attributes: 'policy number, premium' }, { object: 'Claim', attributes: 'claim number' }] } }, { cells: { data: [] } }] },
    )
    expect(table).toHaveTextContent('Vendor support deskPolicy: policy number, premium; Claim: claim number')
    expect(within(table.querySelectorAll('tbody tr')[1] as HTMLElement).getAllByRole('cell')[1]).toHaveTextContent('—')
  })

  it('shows a one-line answer given before the template asked for rich text', () => {
    expect(show({ type: 'text', key: 't', label: 'Base image' }, { value: 'AIA approved image' })).toHaveTextContent('AIA approved image')
  })

  it('shows numbers without a unit, empty choices, empty tables cells and unknown standards', () => {
    expect(show({ type: 'number', key: 'n', label: 'N' }, { value: 3 })).toHaveTextContent('3')
    expect(show({ type: 'multi', key: 'm', label: 'M', options: [] }, { value: { selected: [] } })).toHaveTextContent('—')
    expect(show({ type: 'yesno', key: 'y', label: 'Y' }, { value: { answer: 'no' } })).toHaveTextContent('No')
    const table = show(
      {
        type: 'table',
        key: 't',
        label: 'T',
        addRows: true,
        columns: [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'b', label: 'B', type: 'yesno' },
          { key: 'c', label: 'C', type: 'applications' },
          { key: 'p', label: 'P', type: 'person', personal: true },
          { key: 'd', label: 'D', type: 'choice' },
        ],
      },
      { value: [{ cells: { a: '', b: 'yes', c: { items: [] }, d: 'x' } }] },
    )
    expect(table).toHaveTextContent('ABCPD—Yes——x')
    // A name the reader may not see is "Restricted", not blank.
    const hiddenName = show(
      { type: 'table', key: 't2', label: 'T2', addRows: true, columns: [{ key: 'p', label: 'P', type: 'person', personal: true }] },
      { value: [{ cells: {} }] },
      { trm, retention: [], namesHidden: true },
    )
    expect(hiddenName).toHaveTextContent('PRestricted')
    expect(show({ type: 'retention', key: 'r', label: 'R' }, { value: { rows: [{ standardId: 'gone', resourceName: 'sql-1' }] } })).toHaveTextContent('——sql-1')
    expect(screen.getAllByRole('table').length).toBeGreaterThan(1)
  })
})
