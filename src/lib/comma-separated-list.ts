/** Parse a comma-separated list; quoted segments may contain commas. */
export function parseCommaSeparatedList(input: string): string[] {
  const items: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);
  return items;
}

export function formatCommaSeparatedList(items: string[] | null | undefined): string {
  if (!items?.length) return "";
  return items.join(", ");
}

export function catalogIncludesName(catalog: string[], name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  return catalog.some((c) => c.trim().toLowerCase() === needle);
}

export function findUnknownCatalogNames(catalog: string[], names: string[]): string[] {
  if (!catalog.length) return [];
  const unknown: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (!catalogIncludesName(catalog, trimmed) && !unknown.includes(trimmed)) {
      unknown.push(trimmed);
    }
  }
  return unknown;
}

export function collectCertNamesFromRequirementMaps(
  ...maps: Array<Record<string, string[]> | undefined>
): string[] {
  const names: string[] = [];
  for (const map of maps) {
    if (!map) continue;
    for (const list of Object.values(map)) {
      if (Array.isArray(list)) names.push(...list);
    }
  }
  return names;
}
