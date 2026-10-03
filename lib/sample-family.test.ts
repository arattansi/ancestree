import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SAMPLE_PEOPLE,
  SAMPLE_PHOTOS,
  SAMPLE_PLACES,
  SAMPLE_RELATIONSHIPS,
  SAMPLE_STORIES,
  type SamplePerson,
} from "@/lib/sample-family";

const byId = new Map(SAMPLE_PEOPLE.map((p) => [p.id, p]));
const year = (d: string) => Number(d.slice(0, 4));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Mirrors the people / stories / album date checks in the database. */
function precise(date: string, precision: "day" | "month" | "year" = "day") {
  const [, m, d] = date.split("-");
  return precision === "day" || (d === "01" && (precision === "month" || m === "01"));
}

describe("the sample family", () => {
  it("has about twenty people over four generations, every id distinct", () => {
    expect(SAMPLE_PEOPLE.length).toBeGreaterThanOrEqual(18);
    const ids = [
      ...SAMPLE_PEOPLE.map((p) => p.id),
      ...SAMPLE_STORIES.map((s) => s.id),
      ...SAMPLE_PHOTOS.map((p) => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(uuid);
  });

  it("uses only the places it names, with dates the database takes", () => {
    const places = new Set<number>(Object.values(SAMPLE_PLACES));
    for (const p of SAMPLE_PEOPLE) {
      expect(places.has(p.place_id_birth), p.first_name).toBe(true);
      if (p.place_id_death) expect(places.has(p.place_id_death), p.first_name).toBe(true);
      expect(precise(p.date_of_birth, p.date_of_birth_precision), p.first_name).toBe(true);
      if (p.date_of_death) {
        expect(precise(p.date_of_death, p.date_of_death_precision), p.first_name).toBe(true);
        expect(p.place_of_death, p.first_name).toBeTruthy();
        expect(p.date_of_death > p.date_of_birth).toBe(true);
      }
    }
  });

  it("has nobody under 18, so no child rules apply", () => {
    for (const p of SAMPLE_PEOPLE) {
      if (!p.date_of_death) expect(2026 - year(p.date_of_birth), p.first_name).toBeGreaterThan(18);
    }
  });

  it("connects only its own people, children born while their parents could have them", () => {
    const parentsOf = new Map<string, SamplePerson[]>();
    for (const r of SAMPLE_RELATIONSHIPS) {
      const from = byId.get(r.from);
      const to = byId.get(r.to);
      expect(from && to, `${r.from} → ${r.to}`).toBeTruthy();
      if (r.type === "parent") {
        parentsOf.set(r.to, [...(parentsOf.get(r.to) ?? []), from!]);
        const gap = year(to!.date_of_birth) - year(from!.date_of_birth);
        expect(gap, `${from!.first_name} → ${to!.first_name}`).toBeGreaterThanOrEqual(18);
        expect(gap).toBeLessThanOrEqual(45);
        if (from!.date_of_death) {
          expect(to!.date_of_birth < from!.date_of_death).toBe(true);
        }
      } else {
        // Married after both were 18.
        expect(year(r.marriage_date) - year(from!.date_of_birth)).toBeGreaterThanOrEqual(18);
        expect(year(r.marriage_date) - year(to!.date_of_birth)).toBeGreaterThanOrEqual(18);
      }
    }
    for (const [child, ps] of parentsOf) expect(ps.length, child).toBe(2);
  });

  it("has three or four written stories, each mentioning people other than its own", () => {
    expect(SAMPLE_STORIES.length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_STORIES.length).toBeLessThanOrEqual(4);
    for (const s of SAMPLE_STORIES) {
      expect(byId.has(s.person_id)).toBe(true);
      expect(s.mentions.length).toBeGreaterThan(0);
      expect(s.mentions).not.toContain(s.person_id);
      for (const m of s.mentions) expect(byId.has(m)).toBe(true);
      expect(s.title.length).toBeLessThanOrEqual(120);
      expect(s.body.trim().length).toBeLessThanOrEqual(200_000);
      expect(precise(s.told_on, s.told_on_precision), s.title).toBe(true);
    }
  });

  it("credits every album photo, each a file on disk the bucket takes", () => {
    for (const p of SAMPLE_PHOTOS) {
      expect(p.description.length).toBeLessThanOrEqual(500);
      expect(p.description).toMatch(/Photo: .+(Public domain|CC0), via Wikimedia Commons\.$/);
      expect(p.tags.length).toBeGreaterThan(0);
      for (const t of p.tags) expect(byId.has(t)).toBe(true);
      if (p.taken_on) expect(precise(p.taken_on, p.taken_on_precision)).toBe(true);
      const file = join(process.cwd(), "scripts/sample-tree/photos", p.file);
      expect(existsSync(file), p.file).toBe(true);
      expect(file.endsWith(".jpg")).toBe(true);
      expect(statSync(file).size).toBeLessThan(10 * 1024 * 1024);
    }
  });
});
