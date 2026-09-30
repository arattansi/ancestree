import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/*
 * What every page's header and the tree's canvas load before they draw
 * (Step 87.4, audit C1): their static imports must not reach the form
 * schemas (and zod), react-hook-form or the browser Supabase client, which
 * come later through `lazyComponent` or a dynamic `import()`. Server
 * actions are only references on the client, so the walk stops at them.
 */

const ROOT = path.resolve(__dirname, "..");
const HEAVY = [
  /^zod$/,
  /^react-hook-form$/,
  /^@hookform\//,
  /^@\/lib\/supabase\/client$/,
  /^@\/lib\/(add-)?person-schema$/,
  /^@\/lib\/pet-schema$/,
];

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Every module specifier `file` imports statically, types left out. */
function staticImports(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^;]*?\sfrom\s+"([^"]+)";/gm;
  for (const m of source.matchAll(re)) {
    if (!m[2]) specs.push(m[3]);
  }
  return specs;
}

/** The heavy specifiers reachable from `entry`, with the path to each. */
function heavyReachable(entry: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of staticImports(file)) {
      if (HEAVY.some((re) => re.test(spec))) {
        found.push([...trail, spec].join(" → "));
        continue;
      }
      if (spec.startsWith("@/app/actions/")) continue;
      const next = resolve(file, spec);
      if (next) walk(next, [...trail, path.relative(ROOT, next)]);
    }
  };
  walk(path.join(ROOT, entry), [entry]);
  return found;
}

describe("first load", () => {
  it.each([
    "components/site-header.tsx",
    "components/site-notifications.tsx",
    "components/tree/family-tree.tsx",
    "components/tree/pet-node.tsx",
    "components/request-invite-dialog.tsx",
  ])("%s reaches no form schema, form library or browser client", (entry) => {
    expect(heavyReachable(entry)).toEqual([]);
  });

  it("finds one where there is one", () => {
    expect(heavyReachable("components/tree/pet-panel.tsx")).not.toEqual([]);
  });
});
