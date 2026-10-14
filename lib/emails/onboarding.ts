import { escapeHtml } from "@/lib/email";
import {
  HEADING,
  issueSections,
  NAMES_SHOWN,
  TEXT,
} from "@/lib/emails/newsletter";
import { oneLine, renderEmail } from "@/lib/emails/shared";
import type { Issue } from "@/lib/newsletter";
import type { OnboardingKind, OnboardingStep } from "@/lib/onboarding";

/** Where each email's buttons and links go, on the site's origin. */
export type OnboardingUrls = {
  /** Settings, at the people they added still to invite. */
  claim: string;
  /** The Root console's family link, or settings' invite a relative. */
  invite: string;
  /** Adding a relative to their own entry, or the canvas without one. */
  family: string;
  /** My Family Tree: stories and photos are added from a card there. */
  home: string;
  /** The page that turns these emails off. */
  unsubscribe: string;
  /** A card on My Family Tree, for the win-back's names. */
  personUrl: (personId: string) => string;
  /** A story, for the win-back's. */
  storyUrl: (storyId: string) => string;
};

export type OnboardingEmailInput = {
  kind: OnboardingKind;
  /** The step the button asks for: the email's own, or the win-back's. */
  step: OnboardingStep;
  /** The claim email's second time. */
  reminder: boolean;
  /** The living people they added, whom nobody has invited, oldest first. */
  people: readonly string[];
  /** They run the tree they'd invite to: the family link is theirs. */
  runsTree: boolean;
  /** What changed in their family since they were last here. */
  recap: Issue | null;
  urls: OnboardingUrls;
};

/** Each email's small print: what it is, and the way out. */
function footnote(unsubscribeUrl: string): string {
  return `Tips for your first weeks on ancestree.
                  <a href="${escapeHtml(unsubscribeUrl)}" style="color:#737373;">Unsubscribe</a>.`;
}

/** "A", "A and B", "A, B and C", "A, B, … and 4 more". Plain text. */
export function namesList(names: readonly string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).map(oneLine);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** One step, told on its own: a subject, a heading, a line, a button. */
type StepCopy = {
  /** Plain text. */
  subject: string;
  /** Plain text; escaped where it's drawn. */
  heading: string;
  /** Plain text; escaped where it's drawn. */
  body: string;
  cta: { label: string; url: string };
};

/**
 * Each step's words (Step 151): terse, buttons lower-case (Step 102). The
 * claim email names whom they added; the second time, who's still to
 * invite.
 */
export function stepCopy(input: OnboardingEmailInput): StepCopy {
  const { urls } = input;
  switch (input.step) {
    case "claim": {
      const n = input.people.length;
      const names = namesList(input.people);
      const one = n === 1;
      if (input.reminder) {
        const first = oneLine(input.people[0] ?? "");
        return {
          // Short enough for an inbox: the first, and how many more.
          subject: one ? `Still to invite: ${first}` : `Still to invite: ${first} and ${n - 1} more`,
          heading: "Still to invite",
          body: `${names} ${one ? "hasn’t" : "haven’t"} been invited to ancestree yet.`,
          cta: { label: "invite them", url: urls.claim },
        };
      }
      return {
        subject: one ? `Invite ${names} to ancestree` : `Invite the ${n} people you added`,
        heading: one ? `Invite ${names}` : `Invite the ${n} people you added`,
        body: `You added ${names}. Invite them to claim ${one ? "their entry" : "their entries"} and fill in what they know.`,
        cta: { label: "invite them", url: urls.claim },
      };
    }
    case "invite":
      return input.runsTree
        ? {
            subject: "Invite your family",
            heading: "Invite your family",
            body: "Share your family link. Anyone with it can join your tree.",
            cta: { label: "share the family link", url: urls.invite },
          }
        : {
            subject: "Invite your family",
            heading: "Invite your family",
            body: "Invite a relative by email to add what they know.",
            cta: { label: "invite family", url: urls.invite },
          };
    case "family":
      return {
        subject: "Add your close family",
        heading: "Add your close family",
        body: "Start with your parents, partner, children, brothers and sisters.",
        cta: { label: "add a relative", url: urls.family },
      };
    case "story":
      return {
        subject: "Share a story or a photo",
        heading: "Share a story or a photo",
        body: "Write about someone, or add old photos, for the family to keep.",
        cta: { label: "write a story", url: urls.home },
      };
  }
}

/** The win-back's and the last email's subject, over a recap. */
export const WINBACK_SUBJECT = "What’s new in your family";
export const LAST_SUBJECT = "Your family tree, a month on";

/**
 * A getting started email (Step 151). A step's email is that step alone.
 * The win-back and the last one tell what changed in their family since
 * they were last here (the newsletter's sections), then the step, with My
 * Family Tree beside its button; with nothing changed, the step alone.
 */
export function onboardingEmail(input: OnboardingEmailInput): {
  subject: string;
  html: string;
} {
  const copy = stepCopy(input);
  const away = input.kind === "winback" || input.kind === "last";
  const recap = away && input.recap ? input.recap : null;

  if (!recap) {
    return {
      subject: copy.subject,
      html: renderEmail({
        title: escapeHtml(copy.heading),
        preheader: escapeHtml(copy.body),
        heading: escapeHtml(copy.heading),
        bodyHtml: escapeHtml(copy.body),
        cta: copy.cta,
        footnoteHtml: footnote(input.urls.unsubscribe),
      }),
    };
  }

  const sections = issueSections(recap, input.urls);
  sections.push(
    `<p style="${HEADING}">${escapeHtml(copy.heading)}</p><p style="margin:8px 0 0;${TEXT}">${escapeHtml(copy.body)}</p>`,
  );
  const heading = "Since you were last here";
  return {
    subject: input.kind === "last" ? LAST_SUBJECT : WINBACK_SUBJECT,
    html: renderEmail({
      title: heading,
      preheader: escapeHtml(copy.heading),
      heading,
      contentHtml: sections.join(""),
      cta: copy.cta,
      secondaryCta: { label: "open my family tree", url: input.urls.home },
      footnoteHtml: footnote(input.urls.unsubscribe),
    }),
  };
}
