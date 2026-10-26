"use client";

import {
  ChevronDown,
  FileArchive,
  FileSpreadsheet,
  Loader2Icon,
} from "lucide-react";

import { exportProfileData, exportTaggedMedia } from "@/app/actions/privacy";
import { useAction } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { zipStore, type ZipEntry } from "@/lib/zip";

/** How many files are fetched at once for the .zip. */
const AT_ONCE = 4;

/**
 * Settings' **export data** (Step 207), beside **delete my account** in
 * Privacy & Your Data: their profile as a .csv, or what their entry is
 * tagged in as a .zip. The .zip is built here, from files the server
 * signed links to, so a big album never passes through a function.
 */
export function ExportData() {
  const action = useAction();

  function profile() {
    action.run(
      "export",
      async () => {
        const res = await exportProfileData();
        if (res.error || !res.csv) return { error: res.error ?? "Export failed." };
        saveFile(
          new Blob([res.csv], { type: "text/csv;charset=utf-8" }),
          res.filename ?? "ancestree-profile.csv",
        );
        return {};
      },
      { success: "Profile data downloaded." },
    );
  }

  function media() {
    action.run(
      "export",
      async () => {
        const res = await exportTaggedMedia();
        if (res.error || !res.files || !res.texts) {
          return { error: res.error ?? "Export failed." };
        }
        const encoder = new TextEncoder();
        const entries: ZipEntry[] = res.texts.map((t) => ({
          name: t.name,
          data: encoder.encode(t.text),
        }));
        // A file that won't come is left out and counted, rather than
        // holding back everything else.
        let missed = 0;
        await eachAtOnce(res.files, AT_ONCE, async (file) => {
          try {
            const response = await fetch(file.url);
            if (!response.ok) throw new Error(String(response.status));
            entries.push({
              name: file.name,
              data: new Uint8Array(await response.arrayBuffer()),
            });
          } catch {
            missed += 1;
          }
        });
        if (missed > 0 && missed === res.files.length && res.texts.length <= 1) {
          return { error: "Couldn’t download your files. Try again." };
        }
        // The index first, then each folder in order.
        entries.sort((a, b) =>
          a.name === "media.csv" ? -1 : b.name === "media.csv" ? 1 : a.name.localeCompare(b.name),
        );
        saveFile(
          new Blob(zipStore(entries), { type: "application/zip" }),
          res.filename ?? "ancestree-tagged-media.zip",
        );
        return { missed };
      },
      {
        success: ({ missed }) =>
          missed
            ? `Downloaded. ${missed} ${missed === 1 ? "file" : "files"} couldn’t be fetched.`
            : "Tagged media downloaded.",
      },
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={action.pending}
        aria-busy={action.pending || undefined}
        render={<Button variant="outline" />}
      >
        {action.pending ? (
          <>
            <Loader2Icon className="animate-spin" data-icon="inline-start" aria-hidden />
            preparing…
          </>
        ) : (
          <>
            export data
            <ChevronDown data-icon="inline-end" aria-hidden />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuItem onClick={profile}>
          <FileSpreadsheet aria-hidden />
          download profile data (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={media}>
          <FileArchive aria-hidden />
          download tagged media (.zip)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Runs `work` on each item, `limit` at a time. */
async function eachAtOnce<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/**
 * Hands the browser a file to save. Its link is let go a minute later, not
 * at once: Safari and Firefox may not have started reading it yet.
 */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
