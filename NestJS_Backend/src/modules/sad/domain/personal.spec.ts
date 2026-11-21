import { describe, expect, it } from 'vitest';
import { maskPersonal, keepPersonal } from './personal.js';
import { SAD_TEMPLATE } from './template.js';
import type { SadSectionKey } from './sections.js';

const section = (key: SadSectionKey) => SAD_TEMPLATE.sections.find((s) => s.key === key)!;
const ROW = '70000000-0000-4000-8000-000000000001';
const ROW2 = '70000000-0000-4000-8000-000000000002';
const ada = { id: '00000000-0000-4000-8000-000000000001', name: 'Ada Admin' };
const bob = { id: '00000000-0000-4000-8000-000000000002', name: 'Bob Bee' };
const ALL = { questions: true, columns: true };

describe('personal data in SAD answers', () => {
  it('removes names: answered TRM people fields and person cells', () => {
    const details = { 'business-owner': { value: 'Ada Admin' }, 'supporting-entity': { value: 'AIA Bhd' } };
    expect(maskPersonal(section('application-details'), details, ALL)).toEqual({ 'supporting-entity': { value: 'AIA Bhd' } });
    const apis = { apis: { value: [{ id: ROW, cells: { name: 'Policy API', apiOwner: ada, businessOwner: bob } }] } };
    expect(maskPersonal(section('api-inventory'), apis, ALL)).toEqual({ apis: { value: [{ id: ROW, cells: { name: 'Policy API' } }] } });
    const notApplicable = { apis: { notApplicable: true as const, reason: 'No APIs' } };
    expect(maskPersonal(section('api-inventory'), notApplicable, ALL)).toEqual(notApplicable);
  });

  it('removes only the kind of names that is hidden', () => {
    const details = { 'business-owner': { value: 'Ada Admin' } };
    expect(maskPersonal(section('application-details'), details, { questions: false, columns: true })).toEqual(details);
    const apis = { apis: { value: [{ id: ROW, cells: { name: 'Policy API', apiOwner: ada } }] } };
    expect(maskPersonal(section('api-inventory'), apis, { questions: true, columns: false })).toEqual(apis);
    expect(maskPersonal(section('application-details'), details, { questions: true, columns: false })).toEqual({});
  });

  it('keeps stored names when someone who cannot see them saves, matching rows by id', () => {
    const stored = { apis: { value: [{ id: ROW, cells: { name: 'Policy API', apiOwner: ada } }, { id: ROW2, cells: { name: 'Old', businessOwner: bob } }] }, };
    const saved = { apis: { value: [{ id: ROW, cells: { name: 'Policy API v2', apiOwner: bob } }, { id: '70000000-0000-4000-8000-000000000009', cells: { name: 'New', businessOwner: bob } }] } };
    expect(keepPersonal(section('api-inventory'), saved, stored, ALL)).toEqual({
      apis: { value: [{ id: ROW, cells: { name: 'Policy API v2', apiOwner: ada } }, { id: '70000000-0000-4000-8000-000000000009', cells: { name: 'New' } }] },
    });
    expect(keepPersonal(section('application-details'), { 'business-owner': { value: 'Mallory' } }, { 'business-owner': { value: 'Ada Admin' } }, ALL)).toEqual({
      'business-owner': { value: 'Ada Admin' },
    });
    expect(keepPersonal(section('application-details'), { 'business-owner': { value: 'Mallory' } }, {}, ALL)).toEqual({});
    expect(keepPersonal(section('api-inventory'), { apis: { notApplicable: true, reason: 'None' } }, stored, ALL)).toEqual({ apis: { notApplicable: true, reason: 'None' } });
  });

  it('leaves tables without person columns alone, and new rows without an id get no stored names', () => {
    const roles = { 'role-permissions': { value: [{ row: 'Developers', cells: { permission: 'Read' } }] } };
    expect(maskPersonal(section('security-iam'), roles, ALL)).toEqual(roles);
    const saved = { apis: { value: [{ cells: { name: 'New API', apiOwner: bob } }] } };
    expect(keepPersonal(section('api-inventory'), saved, {}, ALL)).toEqual({ apis: { value: [{ cells: { name: 'New API' } }] } });
  });

  it('takes the names the saver can see from the request', () => {
    const stored = { apis: { value: [{ id: ROW, cells: { name: 'Policy API', apiOwner: ada } }] } };
    const saved = { apis: { value: [{ id: ROW, cells: { name: 'Policy API', apiOwner: bob } }] } };
    expect(keepPersonal(section('api-inventory'), saved, stored, { questions: true, columns: false })).toEqual(saved);
    const owner = { 'business-owner': { value: 'Bob Bee' } };
    expect(keepPersonal(section('application-details'), owner, { 'business-owner': { value: 'Ada Admin' } }, { questions: false, columns: true })).toEqual(owner);
  });
});
