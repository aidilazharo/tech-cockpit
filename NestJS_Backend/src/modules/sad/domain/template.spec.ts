import { describe, expect, it } from 'vitest';
import { SAD_SECTION_KEYS } from './sections.js';
import { DIAGRAM_SLOTS, SLOT_OWNER } from './diagrams.js';
import { SAD_PRINTED_TWICE, SAD_TEMPLATE, SAD_TEMPLATE_VERSION } from './template.js';
import { isQuestion, type Question } from './template-types.js';

const items = SAD_TEMPLATE.sections.flatMap((section) => section.groups.flatMap((group) => group.items.map((item) => ({ section, group, item }))));
const questions = items.filter(({ item }) => isQuestion(item)) as { item: Question; section: (typeof items)[number]['section'] }[];
const byKey = new Map(questions.map((entry, index) => [entry.item.key, { ...entry, index }]));

describe('SAD template', () => {
  it('has every section, in the permission order, each with at least one question', () => {
    expect(SAD_TEMPLATE.sections.map((section) => section.key)).toEqual(SAD_SECTION_KEYS);
    for (const section of SAD_TEMPLATE.sections) {
      expect(section.groups.some((group) => group.items.some(isQuestion)), section.key).toBe(true);
    }
  });

  it('uses unique kebab-case keys for questions and notes, and unique group keys per section', () => {
    const keys = items.map(({ item }) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9-]*$/);
    for (const section of SAD_TEMPLATE.sections) {
      const groups = section.groups.map((group) => group.key);
      expect(new Set(groups).size, section.key).toBe(groups.length);
    }
  });

  it('only shows things based on earlier choice, multiple-choice or yes/no questions, with values they offer', () => {
    const conditions = items.flatMap(({ group, item }) => [
      ...(group.showWhen ? [{ where: `${group.key}`, condition: group.showWhen, at: questions.findIndex((q) => group.items.includes(q.item)) }] : []),
      ...(isQuestion(item) && item.showWhen ? [{ where: item.key, condition: item.showWhen, at: byKey.get(item.key)!.index }] : []),
    ]);
    expect(conditions.length).toBeGreaterThan(5);
    for (const { where, condition, at } of conditions) {
      const target = byKey.get(condition.question);
      expect(target, `${where} → ${condition.question}`).toBeDefined();
      expect(target!.index, `${where} must come after ${condition.question}`).toBeLessThan(at);
      const question = target!.item;
      const offered = question.type === 'yesno' ? ['yes', 'no'] : question.type === 'choice' || question.type === 'multi' ? [...question.options.map((o) => o.value), ...(question.other ? ['other'] : [])] : null;
      expect(offered, `${condition.question} cannot drive conditions`).not.toBeNull();
      for (const value of [...(condition.anyOf ?? []), ...(condition.anyExcept ?? [])]) expect(offered, `${where}: ${value}`).toContain(value);
    }
  });

  it('warns from questions of the same section: values they offer, or a number over a limit', () => {
    const warned = questions.filter(({ item }) => item.warning);
    expect(warned.map(({ item }) => item.key)).toEqual(['api-refresh-token']);
    for (const { item, section } of warned) {
      for (const test of item.warning!.when) {
        const target = byKey.get(test.question);
        expect(target?.section, `${item.key} → ${test.question}`).toBe(section);
        const question = target!.item;
        if (test.over !== undefined) expect(question.type, test.question).toBe('number');
        const offered = question.type === 'yesno' ? ['yes', 'no'] : question.type === 'choice' || question.type === 'multi' ? question.options.map((o) => o.value) : [];
        for (const value of test.anyOf ?? []) expect(offered, `${item.key}: ${value}`).toContain(value);
      }
    }
    expect(byKey.get('api-refresh-token')!.item.warning).toEqual({
      text: 'The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.',
      when: [
        { question: 'api-session-timeout', over: 15 },
        { question: 'api-refresh-token', anyOf: ['no'] },
      ],
    });
  });

  it('lists the questions later versions removed, in the sections they were in, so approved versions still show their answers', () => {
    const retired = SAD_TEMPLATE.sections.flatMap((section) => (section.retired ?? []).map((question) => ({ ...question, section: section.key })));
    expect(retired.map(({ section, key, type, removedIn }) => [section, key, type, removedIn])).toEqual([
      ['solution-integration', 'solution-diagram', 'text', 2],
      ['solution-integration', 'communication-matrix', 'text', 2],
      ['network', 'network-architecture', 'text', 2],
      ['security-design', 'sailpoint', 'yesno', 3],
      ['security-design', 'deployment-details', 'text', 3],
      ['security-design', 'app-session-timeout', 'number', 3],
      ['data-architecture', 'data-flow', 'text', 2],
      ['data-architecture', 'data-modelling', 'text', 2],
    ]);
    for (const question of retired) {
      expect(byKey.has(question.key), `${question.key} is asked again`).toBe(false);
      expect(question.removedIn).toBeLessThanOrEqual(SAD_TEMPLATE_VERSION);
    }
  });

  it('gives choice columns their options and keeps fixed rows unique', () => {
    for (const { item } of questions) {
      if (item.type !== 'table') continue;
      for (const column of item.columns) if (column.type === 'choice') expect(column.options?.length, `${item.key}.${column.key}`).toBeGreaterThan(1);
      if (item.fixedRows) expect(new Set(item.fixedRows).size).toBe(item.fixedRows.length);
      expect(item.fixedRows || item.addRows, item.key).toBeTruthy();
    }
  });

  it('is version 3: the review of 2026-10-25', () => {
    expect(SAD_TEMPLATE_VERSION).toBe(3);
    // "Other (specify)" on every choice and multiple-choice question.
    for (const { item } of questions) if (item.type === 'choice' || item.type === 'multi') expect(item.other, item.key).toBe(true);
    // The one-line answers the spec asks as text.
    const asText = ['base-image', 'container-orchestration', 'role-storage', 'privileged-users', 'service-account-location', 'dev-language', 'storage-services', 'log-location', 'log-retention'];
    for (const key of asText) expect(byKey.get(key)!.item.type, key).toBe('text');
    const security = SAD_TEMPLATE.sections.find((section) => section.key === 'security-design')!;
    const settings = security.groups.find((group) => group.key === 'password-settings')!;
    expect(settings.showWhen).toBeUndefined();
    expect(settings.items.map((item) => item.key)).toEqual(['password-min-length', 'password-expiry', 'password-history', 'account-lockout', 'password-session-timeout']);
    expect(byKey.get('iam-integration')!.item).toMatchObject({ type: 'multi', other: true, options: [{ value: 'sailpoint' }, { value: 'okta' }, { value: 'forgerock' }, { value: 'active-directory' }] });
    expect(byKey.get('iam-integration')!.item.showWhen).toBeUndefined();
    expect(byKey.get('local-auth-justification')!.item).toMatchObject({ type: 'text', allowNotApplicable: false, showWhen: { question: 'authentication-method', anyOf: ['local-custom-authentication', 'other'] } });
    expect(questions.filter(({ item }) => item.allowNotApplicable === false).map(({ item }) => item.key)).toEqual(['local-auth-justification']);
    const privileged = byKey.get('privileged-accounts')!.item;
    expect(privileged.type === 'table' && privileged.columns.map((c) => [c.key, c.type])).toEqual([
      ['account', 'text'],
      ['description', 'text'],
      ['environment', 'choice'],
      ['cyberark', 'yesno'],
    ]);
    // One row per API: owners picked or typed, a URL per environment (at least one), data as rows.
    const apis = byKey.get('apis')!.item;
    expect(apis.type === 'table' && apis.columns.map((c) => [c.key, c.type, c.optional ?? false])).toEqual([
      ['name', 'text', false],
      ['description', 'text', false],
      ['apiOwner', 'person', false],
      ['businessOwner', 'person', false],
      ['productionUrl', 'text', true],
      ['uatUrl', 'text', true],
      ['devUrl', 'text', true],
      ['authMethod', 'choice', false],
      ['hosting', 'choice', false],
      ['thirdParty', 'yesno', false],
      ['classification', 'choice', false],
      ['data', 'dataObjects', false],
      ['dependencies', 'applications', true],
      ['priority', 'choice', false],
      ['justification', 'text', false],
    ]);
    expect(apis).toMatchObject({ oneOf: [['productionUrl', 'uatUrl', 'devUrl']] });
    // Asked once: the session timeout with the password settings, the deployment question in section 10.
    for (const once of ['sailpoint', 'app-session-timeout', 'deployment-details']) expect(byKey.has(once), once).toBe(false);
    expect(SAD_PRINTED_TWICE).toEqual([
      { section: 'security-design', group: 'application-security', before: 'ci-cd', label: 'How the application is deployed across all environments, including the deployment tools', from: 'deployment-environments' },
      { section: 'security-design', group: 'application-security', before: 'integrations', label: 'Session timeout of the application', from: 'password-session-timeout' },
    ]);
    for (const printed of SAD_PRINTED_TWICE) {
      const group = SAD_TEMPLATE.sections.find((section) => section.key === printed.section)!.groups.find((g) => g.key === printed.group)!;
      expect(group.items.some((item) => item.key === printed.before), printed.before).toBe(true);
      expect(byKey.has(printed.from), printed.from).toBe(true);
    }
  });

  it('kept the version 2 changes: the diagrams replace the questions that only asked for a diagram or the matrix', () => {
    for (const dropped of ['solution-diagram', 'communication-matrix', 'network-architecture', 'data-flow', 'data-modelling']) expect(byKey.has(dropped), dropped).toBe(false);
    const deployment = SAD_TEMPLATE.sections.find((section) => section.key === 'deployment')!;
    expect(deployment.groups.map((group) => group.key)).toEqual(['deployment', 'mobile-publishing', 'ci-cd']);
    const ciCd = deployment.groups.find((group) => group.key === 'ci-cd')!;
    expect(ciCd.title).toBe('CI and CD flows');
    expect(ciCd.items.map((item) => item.key)).toEqual(['ci-process', 'cd-process']);
    const data = SAD_TEMPLATE.sections.find((section) => section.key === 'data-architecture')!;
    expect(data.groups.map((group) => group.key)).toEqual(['storage', 'data-flow']);
  });

  it('shows each diagram where the spec places it, drawn only in its owning section', () => {
    const shown = SAD_TEMPLATE.sections.flatMap((section) => section.groups.flatMap((group) => (group.diagrams ?? []).map((ref) => `${section.key}/${group.key}: ${ref.slot} (${ref.view})`)));
    expect(shown).toEqual([
      'solution-integration/solution: solution (solution)',
      'solution-integration/solution: infrastructure (integration)',
      'network/network: infrastructure (infrastructure)',
      'resiliency/dr: infrastructure (infrastructure)',
      'data-architecture/data-flow: solution (data-flow)',
      'deployment/ci-cd: ci-cd (process)',
      'logging/logging: monitoring (monitoring)',
    ]);
    for (const slot of DIAGRAM_SLOTS) {
      const owner = SLOT_OWNER[slot];
      const drawn = SAD_TEMPLATE.sections.find((section) => section.key === owner.section)!.groups.flatMap((group) => group.diagrams ?? []).filter((ref) => ref.slot === slot && ref.view === owner.view);
      expect(drawn, slot).toHaveLength(1);
    }
  });

  it('calls the on-premises hosting option "AIA PDC/SDC", keeping its stored value so answers and show/hide rules still match', () => {
    const hosting = byKey.get('hosting-location')!.item as Extract<Question, { type: 'multi' }>;
    expect(hosting.options).toEqual([
      { value: 'aia-azure', label: 'AIA Azure' },
      { value: 'aia-ssdc', label: 'AIA PDC/SDC' },
      { value: '3rd-party-saas', label: '3rd party SaaS' },
    ]);
  });
});
