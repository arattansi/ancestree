import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageColumn } from "@/components/page-column";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EntrySummary } from "@/components/welcome/entry-summary";
import { WelcomeDetailsForm } from "@/components/welcome/welcome-details-form";
import { parseCrop } from "@/lib/image-crop";
import { loadOwnEntry, ownPlaceholderId } from "@/lib/own-entry.server";
import { personInitials } from "@/lib/person-name";
import { requireTreeSelfPersonWith } from "@/lib/tree-context";
import { joinedFamilyHref, treeHref } from "@/lib/tree-links";
import {
  addedYou,
  enteredLine,
  welcomeAsk,
  welcomeAsks,
  welcomeTitle,
} from "@/lib/welcome";
import { inviterName } from "@/lib/welcome.server";

export const metadata: Metadata = {
  title: "welcome",
  description: "Your entry on the tree, and what it's missing.",
};

/**
 * The welcome on a tree (Step 50), where accepting a claim invite lands, and
 * claiming an entry on onboarding. Their entry is theirs now, but a relative
 * made it: they're asked for a photo and what's missing, then land on My
 * Family Tree, which offers the tree they joined (Step 131). A member who brought their own entry (`?returning=1`) is
 * greeted to the tree instead, with nothing to fill in.
 */
export default async function WelcomePage({
  searchParams,
}: PageProps<"/welcome">) {
  const { returning } = await searchParams;
  // Their entry and who invited them, beside the check that their entry is
  // on this tree (Step 77.1).
  const {
    membership: { tree },
    data: [entry, inviter, placeholderId],
  } = await requireTreeSelfPersonWith(({ tree, profile }) =>
    Promise.all([
      loadOwnEntry(profile),
      inviterName(tree.id, profile.auth_user_id),
      ownPlaceholderId(profile),
    ]),
  );
  // A child who claimed their placeholder (Step 98.3): nothing to fill in,
  // and what's kept waits on their parent.
  if (placeholderId) {
    return (
      <PageColumn>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to {tree.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {addedYou(inviter, tree.name)}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Your details are hidden from the family until your parent
              approves.
            </p>
            <Button
              className="self-start"
              nativeButton={false}
              render={<Link href={joinedFamilyHref(tree.id)} />}
            >
              see my family tree
            </Button>
          </CardContent>
        </Card>
      </PageColumn>
    );
  }
  if (!entry) redirect(treeHref());
  const { person } = entry;

  if (returning) {
    return (
      <PageColumn>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to {tree.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {inviter ? `${inviter} added you. ` : ""}Your entry is on it now.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-5">
            <EntrySummary
              name={entry.displayName}
              initials={personInitials(person)}
              line={enteredLine(person, entry.placeLabels.birth)}
              photoUrl={entry.photoUrl}
              crop={parseCrop(person.photo_crop)}
            />
            <Button
              className="self-start"
              nativeButton={false}
              render={<Link href={joinedFamilyHref(tree.id)} />}
            >
              see my family tree
            </Button>
          </CardContent>
        </Card>
      </PageColumn>
    );
  }

  const asks = welcomeAsks(person);
  return (
    <PageColumn>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {welcomeTitle(person)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {addedYou(inviter, tree.name)} {welcomeAsk(asks)}
        </p>
      </div>
      <Card>
        <CardContent>
          <WelcomeDetailsForm
            homeTreeId={entry.homeTreeId}
            doneHref={joinedFamilyHref(tree.id)}
            entry={person}
            photoUrl={entry.photoUrl}
            birthPlace={entry.placeLabels.birth}
            asks={asks}
          />
        </CardContent>
      </Card>
    </PageColumn>
  );
}
