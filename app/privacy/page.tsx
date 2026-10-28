import type { Metadata } from "next";
import Link from "next/link";

import { RELATIVES_CAN_ASK_LABEL, RELAY_LAPSE_DAYS } from "@/lib/invite-relays";
import { MarketingColumn } from "@/components/marketing/marketing-column";
import { marketingMetadata } from "@/lib/marketing-meta";

// Its meta title and description from the Marketing Site page in Notion
// (Step 188); "shh" is only its name in the menu.
export const metadata: Metadata = marketingMetadata(
  "ancestree • privacy",
  "we don’t mess around with this.",
);

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
            newsletter about your family that you can turn off. If you join
            without one, we keep none and send you nothing until you add one.
          </li>
          <li>
            The demographic details you enter about yourself and relatives: names,
            dates and places of birth and death, where someone living lives
            now, and relationships. Where someone lives is shown only to
            members of their trees, never on a share link or to visitors
            from another tree.
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
            If you let the phone app send you notifications, a token for each
            phone you&rsquo;re signed in on, so Expo, Apple or Google can
            deliver them. It goes when you sign out on that phone or delete
            your account.
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
            If you send a story to the library, the story, its photo and your
            email: used to send you a copy, to answer you, and to publish it
            once edited. It&rsquo;s kept until the library&rsquo;s editors
            delete it, which they do on request.
          </li>
          <li>
            While a sign-in code is on its way, a cookie holding your email
            (and your name, if you&rsquo;re signing up), so the page still
            asks for the code if you reload it. It&rsquo;s gone within the
            hour, or once you sign in.
          </li>
          <li>
            If you like a post in the library, a cookie holding a random
            number, so your like counts once. It says nothing about who you
            are.
          </li>
          <li>
            Google Analytics, on every page: which pages are visited, from
            where, on what kind of device, and for how long. It sets a cookie
            to tell one visit from the next. Nothing you enter about your
            family goes to it, and it never sees who you are on ancestree.
            The site&rsquo;s owners use it to see which pages are read. In the
            European Economic Area, the UK and Switzerland it sets no cookie
            until you allow it, and runs without one if you don&rsquo;t.
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
            A member who joined without an email signs in again only through
            a link a Root of their tree makes for them. It works once, for
            24 hours, and they and every Root of the tree are told when
            it&rsquo;s used.
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
          <li>
            Anyone with an invite link sees, before joining, who sent it and
            their photo, the tree&rsquo;s name, how many are on it and how many
            have joined, and everyone on it as an unnamed leaf in rows by
            generation, shaped like a tree from where they were born. A link to
            claim an entry also names that entry and what it is to whoever sent
            it. Nobody else&rsquo;s name, photo or dates show. Hide your entry
            from visitors and your photo stays off it, and your leaf is a plain
            one.
          </li>
          <li>
            A story told aloud in the phone app is heard by the phone&rsquo;s
            own speech recognition (Apple&rsquo;s or Google&rsquo;s, which may
            send the sound to them to do it) and written up by Claude,
            Anthropic&rsquo;s AI, which also looks in it for births, deaths and
            relatives to suggest for the tree: what was heard, and the names,
            births and deaths of the family on your trees around whoever
            it&rsquo;s about, go to Anthropic for that alone. Nothing goes on
            the tree until whoever recorded it has read it over and said yes.
          </li>
          <li>We never sell or share this data with third parties.</li>
        </ul>
      </Section>

      {/* Step 98's rules; Step 194 put them up front with why. */}
      <Section title="Children under 18">
        <p className="mb-2">
          Children get the most care on ancestree. A child&rsquo;s details are
          their parent&rsquo;s to share: nobody else can add a child under 18,
          and the family sees only what their parent chooses.
        </p>
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

      {/* Step 174.6, Step 177, Step 180, Step 182. Says what the design does;
          "end-to-end encrypted" waits for an outside review (the messaging
          scope, §3.5). */}
      <Section title="Messages">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You can message anyone on a tree you&rsquo;re on, while you share
            one.
          </li>
          <li>
            Each message is encrypted on your device before it&rsquo;s sent,
            with keys only the people in the conversation hold. ancestree
            stores and passes on the encrypted message and can&rsquo;t read
            it, and neither can the site&rsquo;s owners.
          </li>
          <li>
            Write to someone who hasn&rsquo;t visited since messages began and
            it waits, still encrypted, until they do; a device of yours then
            passes it on to them. They get one email saying you wrote, never
            what, and their weekly newsletter says so too. It doesn&rsquo;t go
            while either of you has blocked the other, or while you share no
            tree.
          </li>
          <li>
            What ancestree does see: who wrote to whom, when, how long each
            message is, and when it was read, to deliver messages and show
            what&rsquo;s unread.
          </li>
          <li>
            The weekly newsletter names who has written to you that you
            haven&rsquo;t read, and how many messages, never what they say.
          </li>
          <li>
            The phone app&rsquo;s notification says who wrote, never what.
            None comes for a conversation you&rsquo;ve muted.
          </li>
          <li>
            Your key stays on your devices. Another device of yours gets it
            when you link it from one you&rsquo;ve used, or with a 12-word
            recovery phrase if you set one; that backup is kept encrypted and
            only the phrase opens it. Lose every device without the phrase and
            earlier messages can&rsquo;t be recovered, by you or by us.
          </li>
          <li>
            Deleting a message deletes it for everyone. Muting a conversation
            takes it off your messages count and out of the newsletter.
          </li>
          <li>
            Blocking someone stops either of you writing to the other until
            you unblock them; what you wrote stays.
          </li>
          <li>
            Reporting a message sends its words, as your device read them,
            and who sent it to the Roots of the trees you share and to
            ancestree&rsquo;s reviewers. Nothing else of the conversation
            goes with it, and the person you reported never sees it.
          </li>
          <li>
            You can download your conversations from the messenger. They&rsquo;re
            read on your device, so a tree&rsquo;s export can&rsquo;t include
            them.
          </li>
          <li>
            Deleting your account deletes your conversations, every message
            in them, the reports made from them, and your keys.
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
            <strong>See your data.</strong> Download your profile (a .csv) and
            the photos, recordings and stories you&rsquo;re tagged in (a .zip)
            from settings, any time. A Root can export the full tree as a JSON
            file on request.
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
            <strong>Turn off notifications.</strong> In the phone app&rsquo;s
            settings, for new messages or new stories, or for ancestree in
            your phone&rsquo;s own settings.
          </li>
          <li>
            <strong>Delete your account.</strong> From{" "}
            <Link href="/account" className="underline underline-offset-4">
              your account
            </Link>
            , or the phone app&rsquo;s account screen, you can permanently
            delete your login. Entries you added remain part of the shared
            family record under a Root&rsquo;s stewardship, and stories you
            told stay without your name, unless you also ask for them to be
            removed. A tree nobody else is on is deleted with it, with
            everything on it that no other tree shows.
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
