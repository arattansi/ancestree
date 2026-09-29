import { describe, expect, it } from "vitest";

import { buildPeopleGraph, withPets } from "@/components/tree/build-graph";
import type { TreePet } from "@/lib/pets";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";

// Only what the layout reads; the cards carry the rest untouched.
const person = (id: string, date_of_birth: string) =>
  ({ id, pos_x: null, pos_y: null, pos_dx: null, pos_dy: null, date_of_birth }) as unknown as TreeGraphPerson;
const line = (from: string, to: string, type: string) =>
  ({ id: `${from}-${to}`, from_person: from, to_person: to, type, is_divorced: false }) as unknown as TreeGraphEdge;
const pet = (id: string, companions: string[]) =>
  ({ id, companions, primary_person_id: companions[0], pos_dx: null, pos_dy: null }) as unknown as TreePet;

const people = [person("a", "1950-01-01"), person("b", "1952-01-01"), person("c", "1980-01-01")];
const relationships = [line("a", "b", "spouse"), line("a", "c", "parent"), line("b", "c", "parent")];

describe("companions hung on apart from the people (Step 87.1, C8)", () => {
  it("leaves the people's half as it is", () => {
    const graph = buildPeopleGraph(people, relationships, "c", ["a"]);
    const shown = withPets(graph, [pet("dog", ["c"]), pet("cat", ["a", "b"])]);
    expect(shown.nodes.slice(0, graph.nodes.length)).toEqual(graph.nodes);
    expect(shown.nodes[0]).toBe(graph.nodes[0]);
    expect(shown.edges.slice(0, graph.edges.length)).toEqual(graph.edges);
    expect(shown.layout).toBe(graph.layout);
    expect(graph.nodes.map((n) => n.type)).toEqual(["person", "person", "person"]);
  });

  it("adds a card per companion and a lead to each of its people", () => {
    const graph = buildPeopleGraph(people, relationships, "c", ["a"]);
    const shown = withPets(graph, [pet("dog", ["c"]), pet("cat", ["a", "b"])]);
    expect(shown.nodes.filter((n) => n.type === "pet").map((n) => n.id)).toEqual(["dog", "cat"]);
    expect(shown.edges.filter((e) => e.id.startsWith("c:")).map((e) => e.id)).toEqual([
      "c:c~dog",
      "c:a~cat",
      "c:b~cat",
    ]);
    expect(shown.petPositions.size).toBe(2);
  });

  it("with no companions, draws only the people", () => {
    const graph = buildPeopleGraph(people, relationships, "c", ["a"]);
    const shown = withPets(graph, []);
    expect(shown.nodes).toEqual(graph.nodes);
    expect(shown.edges).toEqual(graph.edges);
  });
});
