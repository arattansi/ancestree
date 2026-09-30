import type { Metadata } from "next";
import Link from "next/link";

import { RELATIVES_CAN_ASK_LABEL, RELAY_LAPSE_DAYS } from "@/lib/invite-relays";
import { PageColumn } from "@/components/page-column";

export const metadata: Metadata = {
  title: "privacy",
  description:
    "How ancestree collects, uses, and protects your family's personal information.",
};

export default function PrivacyPage() {
  return (
    <PageColumn>
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
            Your email address, used only to send one-time sign-in codes and to
            identify your account.
          </li>
          <li>
            The demographic details you enter about yourself and relatives: names,
            dates and places of birth and death, and relationships.
          </li>
          <li>
            Photos and recordings you choose to upload, and when a photo was
            taken.
          </li>
          <li>
            When you add a photo, the names and date saved in it are read on
            your device, to suggest who&rsquo;s in it and when it was taken.
            The photo is uploaded without them, and without where it was
            taken.
          </li>
          <li>
            Activity needed to run the tree: who created an entry, claims,
            stories, reports, and in-app notifications.
          </li>
          <li>
            The days you use ancestree — the date only, not what you looked
            at — so the site&rsquo;s owners can see how much it&rsquo;s used.
            They go when your account does.
          </li>
          <li>
            While you have a tree open, its other members who have it open too
            see that you&rsquo;re there and where your pointer is. It&rsquo;s
            passed between you as it happens and never stored; people viewing
            through a share link, or from another tree, don&rsquo;t see it.
          </li>
          <li>
            If you ask to join a tree, ask a relative on ancestree to invite
            you, or join the waitlist to start one, the name and email you
            give — kept only so a relative or the site owner can answer you,
            and deleted on request.
          </li>
          <li>
            When you ask a relative on ancestree to invite you, a note of your
            email and when you asked, whoever your relative is, used only to
            limit how often one address can ask. Your relative&rsquo;s address
            is never kept. Notes older than a day, and asks a relative
            leaves unanswered for {RELAY_LAPSE_DAYS} days, are deleted as new
            asks come in.
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
            The site&rsquo;s owners see each tree&rsquo;s name and its counts —
            members, entries, days used — never its entries or who anyone is.
          </li>
          <li>
            Photos and recordings live in private storage and are only ever
            served through short-lived signed URLs.
          </li>
          <li>
            A photo shows in someone&rsquo;s album only once they, or whoever
            can edit their entry, approve it.
          </li>
          <li>
            Nothing on the tree is public or indexed by search engines, except
            a story a member shares by its link: anyone with the link can read
            that story, never its comments. The person it&rsquo;s about, whoever
            can edit their entry, or whoever told it can turn its links off.
          </li>
          <li>We never sell or share this data with third parties.</li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>See your data.</strong> A Root can export the full tree as a
            JSON file on request.
          </li>
          <li>
            <strong>Correct an entry.</strong> Edit your own entry any time, or
            report a problem with another for the owner or a Root to fix.
          </li>
          <li>
            <strong>Delete an entry.</strong> Ask a Root to remove an entry and
            its photos and stories.
          </li>
          <li>
            <strong>Stop relatives asking.</strong> Untick &ldquo;
            {RELATIVES_CAN_ASK_LABEL}&rdquo; in{" "}
            <Link
              href="/account?view=settings"
              className="underline underline-offset-4"
            >
              your account&rsquo;s settings
            </Link>
            , and nobody&rsquo;s ask for an invite reaches you. They
            aren&rsquo;t told you&rsquo;ve turned it off.
          </li>
          <li>
            <strong>Delete your account.</strong> From{" "}
            <Link href="/account" className="underline underline-offset-4">
              your account
            </Link>{" "}
            you can permanently delete your login. Entries you added remain part
            of the shared family record under a Root&rsquo;s stewardship, and
            stories you told stay without your name, unless you also ask for
            them to be removed.
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          The tree&rsquo;s Roots are its data stewards. Reach out to the relative
          who invited you, or a Root, with any privacy request.
        </p>
      </Section>

      <p className="text-sm">
        <Link href="/" className="underline underline-offset-4">
          Back home
        </Link>
      </p>
    </PageColumn>
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
