import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { treeLabel } from "@/lib/dashboard";
import {
  countedSince,
  funnelGroups,
  joinsBreakdown,
  sharesBreakdown,
  type FunnelCounts,
  type FunnelGroup,
  type InviteFunnel,
} from "@/lib/invite-funnel";

const cell = "px-4 py-2 text-right align-top tabular-nums";

/**
 * What happened to each tree's invites in the last 30 days (Step 216), so
 * a link never shared shows apart from one shared and never opened, or
 * opened and given up on: made, shared (by which button), opened (once a
 * visitor a day), a sign-in code sent, joined (and how), an email added
 * after joining by name. Outside founders' trees first; test accounts
 * folded away.
 */
export function InviteFunnelCard({ funnel }: { funnel: InviteFunnel | null }) {
  const groups = funnel ? funnelGroups(funnel) : [];
  const since = funnel ? countedSince(funnel) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invites in the Last 30 Days</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!funnel ? (
          <p className="text-muted-foreground">Couldn&rsquo;t load the invites.</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">No invites yet.</p>
        ) : (
          groups.map((group) =>
            group.owner === "test" ? (
              <details key={group.owner} className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {group.title} ({group.trees.length})
                </summary>
                <FunnelTable group={group} />
              </details>
            ) : (
              <section key={group.owner} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">{group.title}</h3>
                <FunnelTable group={group} />
              </section>
            ),
          )
        )}
        {since ? <p className="text-xs text-muted-foreground">{since}.</p> : null}
      </CardContent>
    </Card>
  );
}

function FunnelTable({ group }: { group: FunnelGroup }) {
  return (
    <div className="-mx-(--card-spacing) overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {group.title}: each tree&rsquo;s invite links made, shared, opened, codes sent,
          joins and emails added in the last 30 days
        </caption>
        <thead>
          <tr className="border-b border-border whitespace-nowrap text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Roots
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Made
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Shared
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Opened
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Code sent
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Joined
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Email added
            </th>
          </tr>
        </thead>
        <tbody>
          {group.trees.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <th scope="row" className="min-w-40 px-4 py-2 text-left align-top font-normal">
                <span className="block font-medium">{treeLabel(t)}</span>
                {t.roots.length ? (
                  <span className="block text-xs text-muted-foreground">{t.name}</span>
                ) : null}
              </th>
              <FunnelCells c={t} />
            </tr>
          ))}
        </tbody>
        {group.trees.length > 1 ? (
          <tfoot>
            <tr className="border-t border-border">
              <th scope="row" className="px-4 py-2 text-left align-top font-medium">
                All {group.trees.length}
              </th>
              <FunnelCells c={group.total} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** A row's counts, with how the shares and joins went under theirs. */
function FunnelCells({ c }: { c: FunnelCounts }) {
  return (
    <>
      <td className={cell}>{c.made}</td>
      <td className={cell}>
        {c.shared}
        <Breakdown parts={sharesBreakdown(c)} />
      </td>
      <td className={cell}>{c.opened}</td>
      <td className={cell}>{c.codeSent}</td>
      <td className={cell}>
        {c.joined}
        <Breakdown parts={joinsBreakdown(c)} />
      </td>
      <td className={cell}>{c.emailAdded}</td>
    </>
  );
}

/** "WhatsApp 2" over "copy 1", small, under the count they make up. */
function Breakdown({ parts }: { parts: string[] }) {
  return parts.map((part) => (
    <span key={part} className="block text-xs whitespace-nowrap text-muted-foreground">
      {part}
    </span>
  ));
}
