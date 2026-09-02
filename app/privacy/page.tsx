import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "privacy",
  description:
    "How ancestree collects, uses, and protects your family's personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy &amp; your family&rsquo;s data
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ancestree is a private, invite-only family tree. This page explains
          what we store and the choices you have. It is written with Canada&rsquo;s
          <abbr title="Personal Information Protection and Electronic Documents Act">
            {" "}PIPEDA
          </abbr>{" "}
          principles in mind.
        </p>
      </div>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your email address, used only to send one-time sign-in links and to
            identify your account.
          </li>
          <li>
            The demographic details you enter about yourself and relatives: names,
            dates and places of birth and death, and relationships.
          </li>
          <li>Photos and documents you choose to upload.</li>
          <li>
            Activity needed to run the tree: who created an entry, claims,
            comments, flags, and in-app notifications.
          </li>
        </ul>
      </Section>

      <Section title="How it is protected">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Access is invite-only. Every database row is protected by row-level
            security so only members of your tree can read it.
          </li>
          <li>
            Photos and documents live in private storage and are only ever served
            through short-lived signed URLs.
          </li>
          <li>Nothing on the tree is public or indexed by search engines.</li>
          <li>We never sell or share this data with third parties.</li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>See your data.</strong> An admin can export the full tree as a
            JSON file on request.
          </li>
          <li>
            <strong>Correct an entry.</strong> Edit your own entry any time, or
            flag another entry for the owner or an admin to fix.
          </li>
          <li>
            <strong>Delete an entry.</strong> Ask an admin to remove an entry and
            its photos and documents.
          </li>
          <li>
            <strong>Delete your account.</strong> From{" "}
            <Link href="/account" className="underline underline-offset-4">
              your account
            </Link>{" "}
            you can permanently delete your login. Entries you added remain part
            of the shared family record under an admin&rsquo;s stewardship unless
            you also ask for them to be removed.
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          The tree&rsquo;s admins are its data stewards. Reach out to the relative
          who invited you, or an admin, with any privacy request.
        </p>
      </Section>

      <p className="text-sm">
        <Link href="/" className="underline underline-offset-4">
          Back home
        </Link>
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="text-sm text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
