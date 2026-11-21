import { describe, expect, it } from 'vitest'
import { colourKey, legend, NONE_CLASS, SWATCH } from './colouring'
import type { LandscapeApp } from './schemas'

const app = (overrides: Partial<LandscapeApp>): LandscapeApp => ({
  id: '80000000-0000-4000-8000-000000000001',
  name: 'CRM',
  number: null,
  installStatus: null,
  criticalityRating: null,
  timeRating: null,
  functionalFit: null,
  technicalFit: null,
  capabilityId: null,
  capabilityMismatch: false,
  subdomainIds: [],
  plannedGoLive: null,
  plannedPhaseOut: null,
  plannedRetirement: null,
  vendorEndOfSupport: null,
  missingSince: null,
  ...overrides,
})

describe('tile colouring', () => {
  it('reads the value of each mode, with no value as empty', () => {
    const crm = app({ installStatus: 'In Production', timeRating: 'invest', criticalityRating: '1 - High', functionalFit: 4, technicalFit: null })
    expect(colourKey(crm, 'lifecycle')).toBe('In Production')
    expect(colourKey(crm, 'time')).toBe('invest')
    expect(colourKey(crm, 'criticality')).toBe('1 - High')
    expect(colourKey(crm, 'functionalFit')).toBe('4')
    expect(colourKey(crm, 'technicalFit')).toBe('')
  })

  it('uses fixed scales for TIME and fit, always ending with "no value"', () => {
    expect(legend([], 'time').map((e) => e.key)).toEqual(['tolerate', 'invest', 'migrate', 'eliminate', ''])
    const fit = legend([], 'technicalFit')
    expect(fit.map((e) => e.key)).toEqual(['1', '2', '3', '4', '5', ''])
    expect(fit[0].border).toBe('border-l-data-visualisation-level-2')
    expect(fit.at(-1)).toEqual({ key: '', label: null, border: NONE_CLASS })
  })

  it("uses ServiceNow's values for lifecycle and criticality, sorted, eight colours then grey", () => {
    const apps = ['Retired', 'In Production', 'Retired', 'Implementing'].map((installStatus) => app({ installStatus }))
    expect(legend(apps, 'lifecycle').map((e) => [e.key, e.border])).toEqual([
      ['Implementing', 'border-l-data-visualisation-category-1'],
      ['In Production', 'border-l-data-visualisation-category-2'],
      ['Retired', 'border-l-data-visualisation-category-3'],
      ['', NONE_CLASS],
    ])
    const many = legend(Array.from({ length: 9 }, (_, i) => app({ criticalityRating: `Level ${i}` })), 'criticality')
    expect(many[8].border).toBe(NONE_CLASS)
    expect(SWATCH['border-l-data-visualisation-category-1']).toBe('bg-data-visualisation-category-1')
  })
})
