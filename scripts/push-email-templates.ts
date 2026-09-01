/**
 * Push the branded auth email templates in supabase/templates/ to the hosted
 * Supabase project, so the repo stays the source of truth instead of the
 * Dashboard. Idempotent — re-run after editing a template.
 *
 * The Supabase MCP server cannot do this (it exposes database tools only), so
 * this goes through the Management API, which needs a personal access token
 * from https://supabase.com/dashboard/account/tokens:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run email:push
 *
 * Add --dry-run to print what would be sent without writing anything.
 * The project ref is derived from NEXT_PUBLIC_SUPABASE_URL.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TEMPLATES = [
  {
    label: "Magic Link",
    file: "supabase/templates/magic-link.html",
    subjectKey: "mailer_subjects_magic_link",
    contentKey: "mailer_templates_magic_link_content",
    subject: "Your ancestree sign-in link",
  },
  {
    label: "Confirm signup",
    file: "supabase/templates/confirm-signup.html",
    subjectKey: "mailer_subjects_confirmation",
    contentKey: "mailer_templates_confirmation_content",
    subject: "Confirm your email for ancestree",
  },
] as const;

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  const ref = new URL(url).hostname.split(".")[0];
  if (!ref) throw new Error(`Could not read a project ref from ${url}`);
  return ref;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token && !dryRun) {
    throw new Error(
      "Missing SUPABASE_ACCESS_TOKEN — create one at " +
        "https://supabase.com/dashboard/account/tokens",
    );
  }

  const body: Record<string, string> = {};
  for (const t of TEMPLATES) {
    const html = readFileSync(join(ROOT, t.file), "utf8");
    if (!html.includes("{{ .TokenHash }}")) {
      throw new Error(`${t.file} has no {{ .TokenHash }} — the link would not work`);
    }
    body[t.subjectKey] = t.subject;
    body[t.contentKey] = html;
    console.log(`${t.label.padEnd(15)} ${t.file} (${html.length} bytes)`);
  }

  const ref = projectRef();
  if (dryRun) {
    console.log(`\nDry run — would PATCH config/auth on project ${ref}.`);
    return;
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${await res.text()}`);
  }
  console.log(`\nPushed to project ${ref}. Send yourself a sign-in link to check.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
