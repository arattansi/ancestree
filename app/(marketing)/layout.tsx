import { ElevatorsTree } from "@/components/marketing/elevators-tree";

/**
 * The marketing pages (Step 107): home, /pricing, /manifesto, /features
 * and /about-us, over the Elevators tree (`components/marketing/`). A
 * page's `main` lets the pointer through wherever it draws nothing, so the
 * leaves answer a hover there and its own words and buttons still work.
 * /privacy stays outside the group, plain. Aalim's navigation for these
 * pages, and each page's own copy and styling, are still to come.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      <ElevatorsTree className="absolute inset-0 -z-10" />
      <div className="pointer-events-none flex flex-1 flex-col [&_main>*]:pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
