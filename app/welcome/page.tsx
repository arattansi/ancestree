import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EntrySummary } from "@/components/welcome/entry-summary";
import { WelcomeDetailsForm } from "@/components/welcome/welcome-details-form";
import { parseCrop } from "@/lib/image-crop";
import { loadOwnEntry } from "@/lib/own-entry.server";
import { personInitials } from "@/lib/person-name";
import { requireTreeSelfPerson } from "@/lib/tree-context";
import { treeFocusHref, treeHref } from "@/lib/tree-links";
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
 * made it: they're asked for a photo and what's missing before the tree
 * opens on them. A member who brought their own entry (`?returning=1`) is
 * greeted to the tree instead, with nothing to fill in.
 */
export default async function WelcomePage({
  searchParams,
}: PageProps<"/welcome">) {
  const { tree, profile } = await requireTreeSelfPerson();
  const { returning } = await searchParams;
  const [entry, inviter] = await Promise.all([
    loadOwnEntry(profile),
    inviterName(tree.id, profile.auth_user_id),
  ]);
  if (!entry) redirect(treeHref());
  const { person } = entry;

  if (returning) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
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
              render={<Link href={treeFocusHref(person.id)} />}
            >
              See the tree
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const asks = welcomeAsks(person);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
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
            entry={person}
            photoUrl={entry.photoUrl}
            birthPlace={entry.placeLabels.birth}
            asks={asks}
          />
        </CardContent>
      </Card>
    </main>
  );
}
