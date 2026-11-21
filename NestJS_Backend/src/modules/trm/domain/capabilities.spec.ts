import { describe, expect, it } from 'vitest';
import { buildCapabilityTree, resolveApplicationCapability } from './capabilities.js';

const node = (sysId: string, name: string, parentName: string | null = null) => ({ sysId, name, parentName });

const tree = buildCapabilityTree([
  node('c1', 'Customer'),
  node('c2', 'Onboarding', 'Customer'),
  node('c3', 'Identity check', 'Onboarding'),
  node('c4', 'Finance'),
  node('c5', 'Payments', 'Finance'),
]);

describe('capability tree (from parent names; empty parent = top level)', () => {
  it('works out each capability\'s parent and level', () => {
    expect(tree.nodes.get('c1')).toEqual({ parentSysId: null, level: 1 });
    expect(tree.nodes.get('c2')).toEqual({ parentSysId: 'c1', level: 2 });
    expect(tree.nodes.get('c3')).toEqual({ parentSysId: 'c2', level: 3 });
    expect(tree.issues).toEqual([]);
  });

  it('reports unknown or ambiguous parents, cycles, duplicate names and trees deeper than 3', () => {
    const broken = buildCapabilityTree([
      node('a', 'A'),
      node('b', 'B', 'Nowhere'),
      node('d1', 'Dup'),
      node('d2', 'Dup'),
      node('e', 'E', 'Dup'),
      node('x', 'X', 'Y'),
      node('y', 'Y', 'X'),
      node('l2', 'L2', 'A'),
      node('l3', 'L3', 'L2'),
      node('l4', 'L4', 'L3'),
    ]);
    expect(broken.nodes.get('b')).toEqual({ parentSysId: null, level: null });
    expect(broken.nodes.get('e')).toEqual({ parentSysId: null, level: null });
    expect(broken.nodes.get('x')?.level).toBeNull();
    expect(broken.nodes.get('l4')).toEqual({ parentSysId: 'l3', level: 4 });
    expect(broken.issues).toEqual(
      expect.arrayContaining([
        { sysId: 'b', name: 'B', problem: 'parent-not-found' },
        { sysId: 'd1', name: 'Dup', problem: 'duplicate-name' },
        { sysId: 'd2', name: 'Dup', problem: 'duplicate-name' },
        { sysId: 'e', name: 'E', problem: 'parent-ambiguous' },
        { sysId: 'x', name: 'X', problem: 'cycle' },
        { sysId: 'y', name: 'Y', problem: 'cycle' },
        { sysId: 'l4', name: 'L4', problem: 'too-deep' },
      ]),
    );
    expect(broken.issues).toHaveLength(7);
  });
});

describe("an application's capability (group → family → category)", () => {
  const resolve = (group: string | null, family: string | null, category: string | null) => resolveApplicationCapability(tree, { group, family, category });

  it('belongs to its lowest filled capability when the fields follow the tree', () => {
    expect(resolve('Customer', 'Onboarding', 'Identity check')).toEqual({ capabilitySysId: 'c3', mismatch: false });
    expect(resolve('Customer', 'Onboarding', null)).toEqual({ capabilitySysId: 'c2', mismatch: false });
    expect(resolve('Finance', null, null)).toEqual({ capabilitySysId: 'c4', mismatch: false });
  });

  it('has no capability when no field is filled', () => {
    expect(resolve(null, null, null)).toEqual({ capabilitySysId: null, mismatch: false });
  });

  it('is flagged when the fields disagree with the tree, keeping the lowest capability it can find', () => {
    expect(resolve('Finance', 'Onboarding', 'Identity check')).toEqual({ capabilitySysId: 'c3', mismatch: true });
    expect(resolve('Customer', 'Payments', null)).toEqual({ capabilitySysId: 'c5', mismatch: true });
    expect(resolve(null, 'Onboarding', null)).toEqual({ capabilitySysId: 'c2', mismatch: true }); // gap above
    expect(resolve('Customer', null, 'Identity check')).toEqual({ capabilitySysId: 'c3', mismatch: true }); // gap between
    expect(resolve('Customer', 'Onboarding', 'Unknown')).toEqual({ capabilitySysId: null, mismatch: true });
  });

  it('ignores capabilities without a name and stops at a cycle', () => {
    const odd = buildCapabilityTree([{ sysId: 'n', name: null, parentName: null }, node('x', 'X', 'Y'), node('y', 'Y', 'X')]);
    expect(odd.nodes.get('n')).toEqual({ parentSysId: null, level: 1 });
    expect(resolveApplicationCapability(odd, { group: 'X', family: null, category: null })).toEqual({ capabilitySysId: 'x', mismatch: true });
  });

  it('is flagged when a name is ambiguous', () => {
    const dup = buildCapabilityTree([node('a', 'Same'), node('b', 'Same')]);
    expect(resolveApplicationCapability(dup, { group: 'Same', family: null, category: null })).toEqual({ capabilitySysId: null, mismatch: true });
  });
});
