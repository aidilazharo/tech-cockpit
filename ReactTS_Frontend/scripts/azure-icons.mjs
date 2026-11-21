// Builds the index of Microsoft's Azure architecture icons (file names → names, ids and categories).
// Pure functions, so the index is unit-tested (src/features/sad/diagrams/azure-icon-index.test.ts).

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "10021-icon-service-Virtual-Machine.svg" → number "10021", name "Virtual Machine". */
function parse(file) {
  const match = /^(\d+)\s*-icon-service-(.+)\.svg$/.exec(file);
  return { number: String(Number(match[1])), name: match[2].replace(/-/g, ' ').trim() };
}

/**
 * One entry per icon file (an icon can sit in several category folders), sorted by name. Ids are the name's slug;
 * a later icon with the same name gets its number added.
 */
export function buildIconIndex(files) {
  const byFile = new Map();
  for (const { category, file } of files) {
    const categories = byFile.get(file) ?? new Set();
    categories.add(category);
    byFile.set(file, categories);
  }
  const icons = [...byFile.entries()]
    .map(([file, categories]) => ({ file, categories: [...categories].sort(), ...parse(file) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  const taken = new Set();
  return icons.map(({ file, categories, number, name }) => {
    const id = taken.has(slug(name)) ? `${slug(name)}-${number}` : slug(name);
    taken.add(id);
    return { id, name, categories, file };
  });
}
