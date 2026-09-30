import { describe, expect, it } from "vitest";

import { documentPath, isDocumentOf } from "@/lib/document-path";

const TREE = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";

describe("documentPath", () => {
  it("files a document under its tree and person, with a fresh name", () => {
    const a = documentPath(TREE, PERSON, "pdf");
    const b = documentPath(TREE, PERSON, "pdf");
    expect(a).toMatch(new RegExp(`^${TREE}/${PERSON}/[0-9a-f-]{36}\\.pdf$`));
    expect(a).not.toBe(b);
    expect(isDocumentOf(a, TREE, PERSON)).toBe(true);
  });
});

describe("isDocumentOf", () => {
  it("takes only a file directly in that person's folder on that tree", () => {
    expect(isDocumentOf(`${TREE}/${PERSON}/x.png`, TREE, PERSON)).toBe(true);
    expect(isDocumentOf(`${TREE}/${PERSON}/x.png`, PERSON, TREE)).toBe(false);
    expect(isDocumentOf(`${TREE}/other/x.png`, TREE, PERSON)).toBe(false);
    expect(isDocumentOf(`${TREE}/${PERSON}/deeper/x.png`, TREE, PERSON)).toBe(false);
    expect(isDocumentOf(`${TREE}/${PERSON}/`, TREE, PERSON)).toBe(false);
    expect(isDocumentOf(`${TREE}/${PERSON}/..`, TREE, PERSON)).toBe(false);
    expect(isDocumentOf(`${TREE}/${PERSON}`, TREE, PERSON)).toBe(false);
  });
});
