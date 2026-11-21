export const MAX_CAPABILITY_LEVELS = 3;

export interface CapabilityInput {
  sysId: string;
  name: string | null;
  /** Name of the parent capability; empty for a top-level capability. */
  parentName: string | null;
}

export type CapabilityProblem = 'parent-not-found' | 'parent-ambiguous' | 'duplicate-name' | 'cycle' | 'too-deep';

export interface CapabilityIssue {
  sysId: string;
  name: string | null;
  problem: CapabilityProblem;
}

export interface CapabilityTree {
  /** Resolved parent and level (1 = top). Level is null when the chain never reaches a top-level capability. */
  nodes: Map<string, { parentSysId: string | null; level: number | null }>;
  issues: CapabilityIssue[];
  byName: Map<string, string[]>;
  names: Map<string, string | null>;
}

/** Builds the capability tree from parent names: an empty parent means a top-level capability. */
export function buildCapabilityTree(inputs: readonly CapabilityInput[]): CapabilityTree {
  const byName = new Map<string, string[]>();
  const names = new Map<string, string | null>();
  for (const input of inputs) {
    names.set(input.sysId, input.name);
    if (input.name) byName.set(input.name, [...(byName.get(input.name) ?? []), input.sysId]);
  }

  const issues: CapabilityIssue[] = [];
  const issue = (input: CapabilityInput, problem: CapabilityProblem) => issues.push({ sysId: input.sysId, name: input.name, problem });
  const parents = new Map<string, string | null>();
  const unresolved = new Set<string>();
  for (const input of inputs) {
    // Every named input is in byName (filled above).
    if (input.name && byName.get(input.name)!.length > 1) issue(input, 'duplicate-name');
    if (!input.parentName) {
      parents.set(input.sysId, null);
      continue;
    }
    const candidates = byName.get(input.parentName) ?? [];
    if (candidates.length === 1) {
      parents.set(input.sysId, candidates[0]);
    } else {
      parents.set(input.sysId, null);
      unresolved.add(input.sysId);
      issue(input, candidates.length === 0 ? 'parent-not-found' : 'parent-ambiguous');
    }
  }

  const nodes: CapabilityTree['nodes'] = new Map();
  const inCycle = new Set<string>();
  for (const input of inputs) {
    const path: string[] = [];
    let current: string | null = input.sysId;
    let level: number | null = null;
    while (current !== null) {
      if (path.includes(current)) {
        for (const id of path.slice(path.indexOf(current))) inCycle.add(id);
        break;
      }
      path.push(current);
      if (unresolved.has(current)) break;
      const parent: string | null = parents.get(current) ?? null;
      if (parent === null) {
        level = path.length;
        break;
      }
      current = parent;
    }
    nodes.set(input.sysId, { parentSysId: parents.get(input.sysId) ?? null, level });
  }
  for (const input of inputs) {
    if (inCycle.has(input.sysId)) issue(input, 'cycle');
    const level = nodes.get(input.sysId)?.level;
    if (level != null && level > MAX_CAPABILITY_LEVELS) issue(input, 'too-deep');
  }
  return { nodes, issues, byName, names };
}

export interface ApplicationCapabilityFields {
  group: string | null;
  family: string | null;
  category: string | null;
}

/**
 * The application belongs to its lowest filled capability field. The fields must follow
 * the tree from the top (group = top level, family below it, category below that);
 * otherwise the application is flagged for review, keeping the lowest capability found.
 */
export function resolveApplicationCapability(
  tree: CapabilityTree,
  fields: ApplicationCapabilityFields,
): { capabilitySysId: string | null; mismatch: boolean } {
  const values = [fields.group, fields.family, fields.category].map((value) => value?.trim() || null);
  const lowestIndex = values.findLastIndex((value) => value !== null);
  if (lowestIndex < 0) return { capabilitySysId: null, mismatch: false };

  const unique = (name: string) => {
    const ids = tree.byName.get(name);
    return ids?.length === 1 ? ids[0] : null;
  };
  const capabilitySysId = unique(values[lowestIndex]!);
  if (capabilitySysId === null) return { capabilitySysId: null, mismatch: true };

  // Names from the top of the tree down to the capability.
  const chain: (string | null)[] = [];
  for (let id: string | null = capabilitySysId; id !== null; id = tree.nodes.get(id)?.parentSysId ?? null) {
    chain.unshift(tree.names.get(id)!);
    if (chain.length > MAX_CAPABILITY_LEVELS) break;
  }
  const expected = values.slice(0, lowestIndex + 1);
  const follows =
    tree.nodes.get(capabilitySysId)?.level === lowestIndex + 1 &&
    expected.every((value, index) => value !== null && unique(value) !== null && value === chain[index]);
  return { capabilitySysId, mismatch: !follows };
}
