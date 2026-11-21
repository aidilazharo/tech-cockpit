import { describe, expect, it } from 'vitest';
import { classifySourceField, maskSource } from './source-fields.js';

describe('classification of every ServiceNow field', () => {
  it('treats any cost field as financial, except the currency code', () => {
    for (const key of ['u_annual_license_cost_k_usd', 'u_total_ci_cost', 'cost', 'cost_center', 'u_annual_cost_review_date_most_recent']) {
      expect(classifySourceField(key), key).toBe('financial');
    }
    expect(classifySourceField('cost_cc')).toBeNull();
  });

  it('treats people fields and ServiceNow audit users as personal', () => {
    for (const key of ['it_application_owner', 'u_application_lead', 'u_application_manager', 'owned_by', 'managed_by', 'assigned_to', 'sys_created_by', 'sw_sys_updated_by', 'u_contact']) {
      expect(classifySourceField(key), key).toBe('personal');
    }
  });

  it('leaves everything else internal', () => {
    for (const key of ['name', 'u_owned_business_unit', 'managed_domain', 'install_status', 'u_number_of_users', 'sys_id']) {
      expect(classifySourceField(key), key).toBeNull();
    }
  });

  it('masks the fields of each class the caller may not see', () => {
    const source = { name: 'CRM', owned_by: 'Person 1', cost: '10' };
    expect(maskSource(source, () => true)).toEqual(source);
    expect(maskSource(source, (cls) => cls === 'financial')).toEqual({ name: 'CRM', owned_by: null, cost: '10' });
    expect(maskSource(source, () => false)).toEqual({ name: 'CRM', owned_by: null, cost: null });
    expect(source.owned_by).toBe('Person 1'); // not changed in place
  });
});
