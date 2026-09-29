import { beforeEach, describe, expect, it, vi } from "vitest";

// The photo cleanup with its two dependencies stubbed: Next's `after`, which
// here only collects the task, and the service-role client, which answers
// from the rows and files below.
const afterTasks: (() => unknown)[] = [];
let admin: ReturnType<typeof fakeAdmin>;
let adminCreated: number;

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => afterTasks.push(task),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminCreated += 1;
    return admin.client;
  },
}));

import {
  removeReplacedPhotos,
  removeUndonePhotos,
  removeUnusedPhotos,
} from "@/lib/photo-cleanup.server";

type Revision = {
  id: string;
  person_id: string;
  before: string | null;
  after: string | null;
  reverted: boolean;
};

type Filter = { op: "in" | "is" | "eq"; column: string; value: unknown };

/**
 * A stand-in for the service-role client. Its tables hold only what the
 * cleanup reads — the photo each entry and companion points at, and the
 * Branch edits a Root can undo — and it answers a select by applying the
 * filters it was given, as PostgREST would. Its bucket holds `files`.
 */
function fakeAdmin(state: {
  people?: string[];
  pets?: string[];
  revisions?: Revision[];
  files?: string[];
  failing?: "people" | "pets" | "entry_revisions" | "remove";
  throws?: boolean;
}) {
  const files = new Set(state.files ?? []);
  const asked: { table: string; columns: string; filters: Filter[] }[] = [];
  const removeCalls: string[][] = [];

  const tables: Record<string, Record<string, unknown>[]> = {
    people: (state.people ?? []).map((photo_path) => ({ photo_path })),
    pets: (state.pets ?? []).map((photo_path) => ({ photo_path })),
    entry_revisions: (state.revisions ?? []).map((r) => ({
      id: r.id,
      person_id: r.person_id,
      reverted_at: r.reverted ? "2026-09-29T12:00:00Z" : null,
      "before->>photo_path": r.before,
      "after->>photo_path": r.after,
    })),
  };

  function answer(table: string, columns: string, filters: Filter[], single: boolean) {
    if (state.failing === table) {
      return { data: null, error: { message: "canceling statement" } };
    }
    const rows = tables[table].filter((row) =>
      filters.every((f) =>
        f.op === "in"
          ? (f.value as unknown[]).includes(row[f.column])
          : row[f.column] === f.value,
      ),
    );
    const picked = rows.map((row) =>
      Object.fromEntries(
        columns.split(",").map((item) => {
          const [alias, expr = alias] = item.trim().split(":");
          return [alias, row[expr]];
        }),
      ),
    );
    return { data: single ? (picked[0] ?? null) : picked, error: null };
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let columns = "";
    let single = false;
    const query = {
      select: (c: string) => ((columns = c), query),
      in: (column: string, value: unknown[]) => (filters.push({ op: "in", column, value }), query),
      is: (column: string, value: unknown) => (filters.push({ op: "is", column, value }), query),
      eq: (column: string, value: unknown) => (filters.push({ op: "eq", column, value }), query),
      maybeSingle: () => ((single = true), query),
      then<T>(onFulfilled: (value: ReturnType<typeof answer>) => T) {
        asked.push({ table, columns, filters });
        return Promise.resolve(answer(table, columns, filters, single)).then(onFulfilled);
      },
    };
    return query;
  }

  const client = {
    from,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (state.throws) throw new Error("fetch failed");
          expect(bucket).toBe("photos");
          removeCalls.push(paths);
          if (state.failing === "remove") {
            return { data: null, error: { message: "Storage unavailable" } };
          }
          const gone = paths.filter((p) => files.delete(p));
          return { data: gone.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { client, files, asked, removeCalls };
}

/** Run what the action handed to `after`, as Next does once the response is out. */
async function afterResponse() {
  for (const task of afterTasks.splice(0)) await task();
}

const TREE = "0e062f4d-b471-477c-85d5-76147c32f51f";
const PERSON = "12fe0d78-7355-44b2-97ad-261dbeb782b7";
const SOMEONE = "8a0b54f1-3f5e-4c2d-a7f6-2f1c9e0d4b37";
const PET = "6171652a-1066-454a-a254-a9d4930dd0bb";

const OLD = `${TREE}/${PERSON}/old.jpg`;
const NEW = `${TREE}/${PERSON}/new.jpg`;
const BRANCH = `${TREE}/${PERSON}/branch.jpg`;
const PET_OLD = `${TREE}/pets/${PET}/old.jpg`;

beforeEach(() => {
  afterTasks.length = 0;
  adminCreated = 0;
  admin = fakeAdmin({});
});

describe("a photo a save left behind (Step 82)", () => {
  it("goes once the response is out, when nothing points at it", async () => {
    admin = fakeAdmin({ people: [NEW], files: [OLD, NEW] });
    removeReplacedPhotos("person", PERSON, [OLD], NEW);

    // Nothing is asked or removed while the save answers…
    expect(afterTasks).toHaveLength(1);
    expect(adminCreated).toBe(0);

    // …then the three places that could still show it are asked, and it goes.
    await afterResponse();
    expect(admin.asked).toEqual([
      {
        table: "people",
        columns: "photo_path",
        filters: [{ op: "in", column: "photo_path", value: [OLD] }],
      },
      {
        table: "pets",
        columns: "photo_path",
        filters: [{ op: "in", column: "photo_path", value: [OLD] }],
      },
      {
        table: "entry_revisions",
        columns: "photo_path:before->>photo_path",
        filters: [
          { op: "is", column: "reverted_at", value: null },
          { op: "in", column: "before->>photo_path", value: [OLD] },
        ],
      },
    ]);
    expect(admin.removeCalls).toEqual([[OLD]]);
    expect([...admin.files]).toEqual([NEW]);
  });

  it("goes when the photo is cleared, a companion's too", async () => {
    admin = fakeAdmin({ files: [PET_OLD] });
    removeReplacedPhotos("pet", PET, [PET_OLD], null);
    await afterResponse();
    expect(admin.files.size).toBe(0);
  });

  it("asks nothing when the photo didn't change or there was none", () => {
    removeReplacedPhotos("person", PERSON, [NEW], NEW);
    removeReplacedPhotos("person", PERSON, [null], NEW);
    removeReplacedPhotos("pet", PET, [undefined], null);
    expect(afterTasks).toEqual([]);
    expect(adminCreated).toBe(0);
  });

  it("never touches a file outside the entry's own folder", async () => {
    const planted = `${TREE}/${SOMEONE}/theirs.jpg`;
    admin = fakeAdmin({ files: [planted] });
    removeReplacedPhotos("person", PERSON, [planted], NEW);
    removeReplacedPhotos("pet", PET, [`${TREE}/pets/${SOMEONE}/x.jpg`], null);
    await afterResponse();
    expect(adminCreated).toBe(0);
    expect([...admin.files]).toEqual([planted]);
  });

  it("stays while another entry or a companion still shows it", async () => {
    admin = fakeAdmin({ people: [NEW, OLD], files: [OLD, NEW] });
    removeReplacedPhotos("person", PERSON, [OLD], NEW);
    await afterResponse();
    expect(admin.removeCalls).toEqual([]);

    admin = fakeAdmin({ pets: [PET_OLD], files: [PET_OLD] });
    removeReplacedPhotos("pet", PET, [PET_OLD], null);
    await afterResponse();
    expect(admin.files.has(PET_OLD)).toBe(true);
  });

  it("stays while a Root can still undo the Branch's edit that replaced it", async () => {
    const edit = { id: "r1", person_id: PERSON, before: OLD, after: NEW };
    admin = fakeAdmin({
      people: [NEW],
      revisions: [{ ...edit, reverted: false }],
      files: [OLD, NEW],
    });
    removeReplacedPhotos("person", PERSON, [OLD], NEW);
    await afterResponse();
    expect(admin.files.has(OLD)).toBe(true);

    // An undone edit keeps nothing: that undo can't come again.
    admin = fakeAdmin({
      people: [NEW],
      revisions: [{ ...edit, reverted: true }],
      files: [OLD, NEW],
    });
    removeReplacedPhotos("person", PERSON, [OLD], NEW);
    await afterResponse();
    expect(admin.files.has(OLD)).toBe(false);
  });

  it("stays when what still shows it can't be told", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const failing of ["people", "pets", "entry_revisions"] as const) {
      admin = fakeAdmin({ files: [OLD], failing });
      removeReplacedPhotos("person", PERSON, [OLD], NEW);
      await afterResponse();
      expect(admin.removeCalls).toEqual([]);
    }
    expect(logged).toHaveBeenCalledWith(
      "[photo-cleanup] couldn't tell what still shows a photo",
      "canceling statement",
    );
    logged.mockRestore();
  });

  it("never throws, when storage refuses or can't be reached", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    admin = fakeAdmin({ files: [OLD], failing: "remove" });
    await expect(removeUnusedPhotos([OLD])).resolves.toEqual([]);
    admin = fakeAdmin({ files: [OLD], throws: true });
    await expect(removeUnusedPhotos([OLD])).resolves.toEqual([]);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it("asks once for a file named twice, and not at all for none", async () => {
    admin = fakeAdmin({ files: [OLD] });
    await expect(removeUnusedPhotos([OLD, OLD])).resolves.toEqual([OLD]);
    expect(admin.removeCalls).toEqual([[OLD]]);
    await expect(removeUnusedPhotos([])).resolves.toEqual([]);
    expect(adminCreated).toBe(1);
  });
});

describe("the photos a Root's undo leaves (Step 82)", () => {
  it("removes the Branch's once the old photo is back", async () => {
    admin = fakeAdmin({
      people: [OLD],
      revisions: [{ id: "r1", person_id: PERSON, before: OLD, after: BRANCH, reverted: true }],
      files: [OLD, BRANCH],
    });
    removeUndonePhotos("r1");
    expect(adminCreated).toBe(0);
    await afterResponse();
    expect([...admin.files]).toEqual([OLD]);
  });

  it("removes the old one when the photo had changed again since", async () => {
    const later = `${TREE}/${PERSON}/later.jpg`;
    admin = fakeAdmin({
      people: [later],
      revisions: [{ id: "r1", person_id: PERSON, before: OLD, after: BRANCH, reverted: true }],
      files: [OLD, later],
    });
    removeUndonePhotos("r1");
    await afterResponse();
    expect([...admin.files]).toEqual([later]);
  });

  it("touches no file for an edit that held no photo", async () => {
    admin = fakeAdmin({
      revisions: [{ id: "r1", person_id: PERSON, before: null, after: null, reverted: true }],
      files: [OLD],
    });
    removeUndonePhotos("r1");
    await afterResponse();
    expect(admin.asked.map((q) => q.table)).toEqual(["entry_revisions"]);
    expect(admin.removeCalls).toEqual([]);
  });

  it("never follows an edit's photo out of the entry's own folder", async () => {
    const planted = `${TREE}/${SOMEONE}/theirs.jpg`;
    admin = fakeAdmin({
      revisions: [{ id: "r1", person_id: PERSON, before: planted, after: null, reverted: true }],
      files: [planted],
    });
    removeUndonePhotos("r1");
    await afterResponse();
    expect(admin.removeCalls).toEqual([]);
  });
});
