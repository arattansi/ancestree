import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDay } from "@/lib/dashboard";
import {
  cardFunnelGroups,
  cardSharesBreakdown,
  cardsCountedSince,
  signedBreakdown,
  type CardFunnel,
  type CardFunnelRow,
} from "@/lib/card-funnel";

const cell = "px-4 py-2 text-right align-top tabular-nums";

/**
 * What happened to each birthday card in the last 30 days (Step 217.3),
 * beside the invites: links made (public and personal), shared (by which
 * button), opened (once a browser a day), signed (in the app, through the
 * link, through a personal link), join buttons shown, asks sent, claims.
 * Outside founders' trees first; test accounts folded away.
 */
export function CardFunnelCard({ funnel }: { funnel: CardFunnel | null }) {
  const groups = funnel ? cardFunnelGroups(funnel) : [];
  const since = funnel ? cardsCountedSince(funnel) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Birthday Cards in the Last 30 Days</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!funnel ? (
          <p className="text-muted-foreground">Couldn&rsquo;t load the cards.</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">No cards yet.</p>
        ) : (
          groups.map((group) =>
            group.owner === "test" ? (
              <details key={group.owner} className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {group.title} ({group.cards.length})
                </summary>
                <CardTable title={group.title} cards={group.cards} />
              </details>
            ) : (
              <section key={group.owner} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">{group.title}</h3>
                <CardTable title={group.title} cards={group.cards} />
              </section>
            ),
          )
        )}
        {since ? <p className="text-xs text-muted-foreground">{since}.</p> : null}
      </CardContent>
    </Card>
  );
}

function CardTable({ title, cards }: { title: string; cards: CardFunnelRow[] }) {
  const heads = ["Links", "Shared", "Opened", "Signed", "Join shown", "Asked", "Claimed"];
  return (
    <div className="-mx-(--card-spacing) overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {title}: each card&rsquo;s links made, shares, opens, signatures, join buttons shown, asks
          and claims in the last 30 days
        </caption>
        <thead>
          <tr className="border-b border-border whitespace-nowrap text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Card
            </th>
            {heads.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 text-right font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <th scope="row" className="min-w-40 px-4 py-2 text-left align-top font-normal">
                <span className="block font-medium">
                  {c.firstName} · {shortDay(c.opensOn)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {c.treeName} · {c.signatures === 1 ? "1 signature" : `${c.signatures} signatures`}
                </span>
              </th>
              <td className={cell}>
                {c.links + c.personalLinks}
                {c.personalLinks > 0 ? <Breakdown parts={[`personal ${c.personalLinks}`]} /> : null}
              </td>
              <td className={cell}>
                {c.shared}
                <Breakdown parts={cardSharesBreakdown(c)} />
              </td>
              <td className={cell}>{c.opened}</td>
              <td className={cell}>
                {c.signed}
                <Breakdown parts={signedBreakdown(c)} />
              </td>
              <td className={cell}>{c.joinShown}</td>
              <td className={cell}>{c.asked}</td>
              <td className={cell}>{c.claimed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
