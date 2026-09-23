import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rootOf = vi.fn();
const setCurrentTreeCookie = vi.fn();
vi.mock("@/lib/tree-context", () => ({ rootOf: (id: string) => rootOf(id) }));
vi.mock("@/lib/current-tree.server", () => ({
  setCurrentTreeCookie: (id: string) => setCurrentTreeCookie(id),
}));

import { openConsoleHref } from "@/lib/admin-queue";
import { openConsole, signInLanding } from "@/lib/open-console.server";

const TREE = "6f1c2b3a-0000-4000-8000-000000000001";

beforeEach(() => {
  rootOf.mockReset();
  setCurrentTreeCookie.mockReset();
});

describe("openConsole", () => {
  it("switches to the tree for a Root of it and opens its card", async () => {
    rootOf.mockResolvedValue({ membership: { tree: { id: TREE } } });
    const url = new URL(openConsoleHref("invite-requests", TREE), "https://x.test");
    await expect(openConsole(url.searchParams)).resolves.toBe(
      "/account?view=admin#invite-requests",
    );
    expect(rootOf).toHaveBeenCalledWith(TREE);
    expect(setCurrentTreeCookie).toHaveBeenCalledWith(TREE);
  });

  it("leaves the tree alone for anyone who isn't a Root of it", async () => {
    rootOf.mockResolvedValue({ error: "Only a Root of this tree can do that." });
    const url = new URL(openConsoleHref("invite-requests", TREE), "https://x.test");
    await expect(openConsole(url.searchParams)).resolves.toBe(
      "/account?view=admin#invite-requests",
    );
    expect(setCurrentTreeCookie).not.toHaveBeenCalled();
  });

  it("opens a console they run when the alert isn't about one tree", async () => {
    const url = new URL(openConsoleHref("tree-requests"), "https://x.test");
    await expect(openConsole(url.searchParams)).resolves.toBe(
      "/account?view=admin#tree-requests",
    );
    expect(rootOf).not.toHaveBeenCalled();
  });

  it("ignores a card that isn't a queue", async () => {
    await expect(openConsole(new URLSearchParams("section=members"))).resolves.toBe(
      "/account?view=admin",
    );
  });
});

describe("signInLanding", () => {
  it("passes any other page straight through", async () => {
    await expect(signInLanding("/tree")).resolves.toBe("/tree");
    await expect(signInLanding("/account?view=admin")).resolves.toBe("/account?view=admin");
    expect(rootOf).not.toHaveBeenCalled();
  });

  it("opens an alert email's console button on the spot", async () => {
    rootOf.mockResolvedValue({ membership: { tree: { id: TREE } } });
    await expect(
      signInLanding(openConsoleHref("invite-requests", TREE)),
    ).resolves.toBe("/account?view=admin#invite-requests");
    expect(setCurrentTreeCookie).toHaveBeenCalledWith(TREE);
  });
});
