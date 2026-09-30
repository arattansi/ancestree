import { afterEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "@/lib/image";

/**
 * The browser's drawing surface, stubbed: what each test breaks is the one
 * step a real browser can fail at. Whatever fails, the file as picked must
 * never come back (Step 91): it carries its EXIF, GPS included.
 */
function stubBrowser({
  // Which of the two ways in opens it: `createImageBitmap`, the `<img>`
  // it falls back to, or neither.
  opens = "bitmap" as "bitmap" | "img" | "neither",
  context = true,
  draws = true,
  blob = true as boolean,
} = {}) {
  const drawn: number[][] = [];
  vi.stubGlobal("createImageBitmap", async () => {
    if (opens !== "bitmap") throw new Error("can't decode");
    return { width: 4000, height: 3000, close() {} };
  });
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (opens === "img" ? this.onload : this.onerror)?.());
      }
      width = 4000;
      height = 3000;
    },
  );
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () =>
        context
          ? {
              drawImage: (_: unknown, ...rest: number[]) => {
                if (!draws) throw new Error("broken image");
                drawn.push(rest);
              },
            }
          : null,
      toBlob: (done: (b: Blob | null) => void, type: string) =>
        done(blob ? new Blob(["redrawn"], { type }) : null),
    }),
  });
  return drawn;
}

const picked = () =>
  new File(["\xff\xd8\xff\xe1 Exif GPS"], "IMG_0001.JPG", { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compressImage", () => {
  it("redraws a photo as a new, smaller JPEG", async () => {
    const drawn = stubBrowser();
    const file = picked();
    const out = await compressImage(file);
    expect(out).not.toBeNull();
    expect(out).not.toBe(file);
    expect(out!.type).toBe("image/jpeg");
    expect(out!.name).toBe("IMG_0001.jpg");
    expect(await out!.text()).toBe("redrawn");
    expect(drawn).toEqual([[0, 0, 1280, 960]]);
  });

  it("takes a longer edge when asked", async () => {
    const drawn = stubBrowser();
    await compressImage(picked(), { maxEdge: 1600 });
    expect(drawn).toEqual([[0, 0, 1600, 1200]]);
  });

  it("is null, not the file as picked, whatever step fails", async () => {
    for (const broken of [
      { opens: "neither" as const },
      { context: false },
      { draws: false },
      { blob: false },
    ]) {
      stubBrowser(broken);
      expect(await compressImage(picked()), JSON.stringify(broken)).toBeNull();
      vi.unstubAllGlobals();
    }
  });

  it("falls back to an <img> when createImageBitmap can't open it", async () => {
    stubBrowser({ opens: "img" });
    expect(await compressImage(picked())).not.toBeNull();
  });

  it("is null for a file that isn't an image", async () => {
    stubBrowser();
    const pdf = new File(["%PDF"], "scan.pdf", { type: "application/pdf" });
    expect(await compressImage(pdf)).toBeNull();
  });
});
