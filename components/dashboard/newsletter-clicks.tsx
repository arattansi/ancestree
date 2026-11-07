import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dayWithYear } from "@/lib/dashboard";
import {
  clickedShare,
  openedShare,
  sectionTotals,
  type NewsletterEngagement,
} from "@/lib/newsletter-engagement";

const cell = "px-4 py-2 text-right tabular-nums";

/**
 * The weekly newsletter's links opened (Step 225): per issue, how many were
 * sent and how many members arrived from one of its links, once each, then
 * which links. Opens (Step 226) are counted only in the copies of members who
 * said yes, and read high: a mail app loads images before anyone reads
 * (Apple's), and some people never see them. A link opened signed out isn't
 * a member yet, so it isn't counted either.
 */
export function NewsletterClicksCard({
  engagement,
}: {
  engagement: NewsletterEngagement | null;
}) {
  const totals = engagement ? sectionTotals(engagement.issues) : [];
  // Only the issues someone was counting in (Step 226).
  const counted = engagement ? engagement.issues.filter((i) => i.counting > 0) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Newsletter Clicks</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!engagement ? (
          <p className="text-muted-foreground">Couldn&rsquo;t load the newsletter.</p>
        ) : engagement.issues.length === 0 ? (
          <p className="text-muted-foreground">No issues counted yet.</p>
        ) : (
          <>
            <div className="-mx-(--card-spacing) overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Each weekly issue: how many were sent, how many members opened a link in
                  it, and the share
                </caption>
                <thead>
                  <tr className="border-b border-border whitespace-nowrap text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Issue
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Sent
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Clicked
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {engagement.issues.map((i) => (
                    <tr key={i.day} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        {dayWithYear(i.day)}
                      </th>
                      <td className={cell}>{i.sent}</td>
                      <td className={cell}>{i.clicked}</td>
                      <td className={cell}>{clickedShare(i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {counted.length ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Opens, from members who said yes
                </h3>
                <div className="-mx-(--card-spacing) overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Each issue: how many copies were counting opens, how many of those
                      were opened, and the share
                    </caption>
                    <thead>
                      <tr className="border-b border-border whitespace-nowrap text-muted-foreground">
                        <th scope="col" className="px-4 py-2 text-left font-medium">
                          Issue
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">
                          Counting
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">
                          Opened
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {counted.map((i) => (
                        <tr key={i.day} className="border-b border-border last:border-0">
                          <th scope="row" className="px-4 py-2 text-left font-normal">
                            {dayWithYear(i.day)}
                          </th>
                          <td className={cell}>{i.counting}</td>
                          <td className={cell}>{i.opened}</td>
                          <td className={cell}>{openedShare(i)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Apple Mail marks a copy opened when it arrives.
                </p>
              </section>
            ) : null}
            {totals.length ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Links, in these issues
                </h3>
                <div className="-mx-(--card-spacing) overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Members who opened a link of each block of the newsletter, over the
                      issues above
                    </caption>
                    <tbody>
                      {totals.map((t) => (
                        <tr key={t.section} className="border-b border-border last:border-0">
                          <th scope="row" className="px-4 py-2 text-left font-normal">
                            {t.label}
                          </th>
                          <td className={cell}>{t.members}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {engagement.countedFrom ? (
              <p className="text-xs text-muted-foreground">
                Counted since {dayWithYear(engagement.countedFrom)}.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
