import type { Metadata } from "next";
import Link from "next/link";

import { RELATIVES_CAN_ASK_LABEL, RELAY_LAPSE_DAYS } from "@/lib/invite-relays";
import { MarketingColumn } from "@/components/marketing/marketing-column";

export const metadata: Metadata = {
  // The marketing site's name for it (Step 107); the heading, in brackets,
  // says what it is.
  title: "shh",
  description:
    "How ancestree collects, uses, and protects your family's personal information.",
};

export default function PrivacyPage() {
  return (
    <MarketingColumn>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          (privacy + your family&rsquo;s data)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ancestree is a private family tree. This page explains
          what we store and the choices you have. It is written with Canada&rsquo;s{" "}
          <a
            href="https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            <abbr title="Personal Information Protection and Electronic Documents Act">
              PIPEDA
            </abbr>
          </a>{" "}
          principles in mind.
        </p>
      </div>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your email address, used only to identify your account and to send
            one-time sign-in codes, alerts about your trees, and a weekly
            newsletter about your family that you can turn off.
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
            If you ask to join a tree, or ask a relative on ancestree to
            invite you, the name and email you
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
          <li>
            Google Analytics, on every page: which pages are visited, from
            where, on what kind of device, and for how long. It sets a cookie
            to tell one visit from the next. Nothing you enter about your
            family goes to it, and it never sees who you are on ancestree.
            The site&rsquo;s owners use it to see which pages are read.
          </li>
        </ul>
      </Section>

      <Section title="How it is protected">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Joining a tree is by invite. Every database row is protected by
            row-level security so only members of your tree can read it.
          </li>
          <li>
            The site&rsquo;s owners see each tree&rsquo;s name and its counts —
            members, entries, days used — never its entries or who anyone is.
            For the links they share to start a tree, they see only how many
            opened each one, signed up and started a tree, never who.
          </li>
          <li>
            The site&rsquo;s owners can suspend an account, which stops it
            signing in until they restore it, and delete an account or a
            tree, as its member or Root could.
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

      <Section title="Children under 18">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Only a parent adds their own child under 18 — not a Root, not
            anyone else. Whoever adds someone who could be a child, or draws
            a line that makes them one, is asked whether they&rsquo;re 18 or
            older. A no, or a date of birth under 18, is refused.
          </li>
          <li>
            Only a parent, or the child themselves, can give someone a date
            of birth under 18 later.
          </li>
          <li>
            A Root or a Branch may hold a child&rsquo;s place instead: a
            placeholder shown as &ldquo;First Child&rdquo;,
            &ldquo;Second Child&rdquo;…, with no name, dates, photo or any
            other detail. The parent is told, or can be invited to join if
            they&rsquo;re not a member yet.
          </li>
          <li>
            Only the parent fills a placeholder in. Until they do, nobody else
            can edit it, suggest a change, claim it, tell a story about it or
            tag it in a photo, and it never comes up in search.
          </li>
          <li>
            Children added by someone else before these rules became
            placeholders. What had been entered about them is held back, seen
            only by their parent and the child. The parent chooses what, if
            anything, the family sees, or deletes it. Nobody else decides.
          </li>
          <li>
            A child may be invited to claim their placeholder. It becomes
            theirs, but stays a placeholder to everyone else until their
            parent approves showing it.
          </li>
          <li>
            The parent can delete their child&rsquo;s placeholder until the
            child has claimed it.
          </li>
        </ul>
      </Section>

      <Section title="Your entry on other trees">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You&rsquo;re one entry, shown on every tree that brings you in.
            Your details follow your home tree&rsquo;s rules, and you choose
            which tree that is.
          </li>
          <li>
            A Root of another tree can bring you over only from a tree they
            belong to that already shows you. Until you say yes, that tree
            shows just your name, your place of birth and who you&rsquo;re
            connected to — no dates, photo, stories or album.
          </li>
          <li>
            You&rsquo;re told by notice and email, and answer under
            &ldquo;Asked of You&rdquo; in{" "}
            <Link
              href="/account?view=settings"
              className="underline underline-offset-4"
            >
              your account&rsquo;s settings
            </Link>
            . A no isn&rsquo;t asked again. Either answer can be changed
            later; a yes taken back hides the rest again. Asks left
            unanswered for 30 days lapse, and the rest stays hidden.
          </li>
          <li>
            Accepting an invite to a tree, or claiming your entry on it,
            counts as a yes there.
          </li>
          <li>
            For a relative who isn&rsquo;t a member, whoever looks after their
            entry on its home tree answers for them.
          </li>
          <li>
            A Root may let members of another tree they belong to view their
            tree, read-only: no stories, album or edits. Tick &ldquo;Hide my
            entry from visitors&rdquo; in settings and those visitors see a
            blurred card with no name or details.
          </li>
          <li>
            A tree&rsquo;s Roots can take you off it at any time.
          </li>
        </ul>
      </Section>

      <Section title="Name only">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            On any tree but your home, you can make your card show only your
            name, from &ldquo;Your Entry&rdquo; in{" "}
            <Link
              href="/account?view=settings"
              className="underline underline-offset-4"
            >
              your account&rsquo;s settings
            </Link>
            . It&rsquo;s drawn as a small name tag, still joined to your
            family there, with no place of birth, dates, photo, stories or
            album.
          </li>
          <li>
            If you&rsquo;re a member of that tree, you leave it too, and what
            you added there passes to one of its Roots. A Root can&rsquo;t
            leave their own tree this way, and nobody can leave their only
            tree.
          </li>
          <li>
            The tree&rsquo;s Roots are told. None of them can undo it, and
            taking your card off and bringing it back keeps it name only.
          </li>
          <li>
            Only you can show more again. Your card goes back to your name
            and place of birth, and showing the rest is still your yes to
            give.
          </li>
          <li>
            A Root may make the card of anyone brought over from another tree
            name only, unless they&rsquo;re a member there. The Root can undo
            that; so can you.
          </li>
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
    </MarketingColumn>
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
