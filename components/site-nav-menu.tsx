"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { NAV_TREE, NAV_TREE_SIZE, type NavTreeWord } from "@/lib/nav-tree";
import { navHeldOpenOn } from "@/lib/nav-words";

/** The words, in the order they fly: the same in the pile and the tree. */
const NAV_WORDS = NAV_TREE;
import { cn } from "@/lib/utils";

/** The open menu, in CSS pixels per pixel of Aalim's drawing. */
const LIST_SCALE = 0.75;
/** Where the words fly from: a small pile, unseen, inside **menu**. */
const PILE_SCALE = 0.2;

const OPEN_MS = 560;
const CLOSE_MS = 360;
/** Each word leaves the pile a beat after the one above it. */
const STAGGER_MS = 45;
/** A little past its place and back, as if it were thrown there. */
const OPEN_EASING = "cubic-bezier(0.34, 1.32, 0.64, 1)";
const CLOSE_EASING = "cubic-bezier(0.5, 0, 0.75, 0)";

/**
 * On the marketing site (`navHeldOpenOn`) the list stays open from this
 * width, the one the pile moves to the corner at: room for it beside the
 * page.
 */
const ROOM_FOR_IT = "(min-width: 1240px)";

function useRoomForIt(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(ROOM_FOR_IT);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(ROOM_FOR_IT).matches,
    () => false,
  );
}

function Word({ word }: { word: NavTreeWord }) {
  // A turned word's box is already on its side; its ink is turned to match,
  // a quarter turn anticlockwise so it reads from the ground up.
  const drawn = word.turned
    ? { width: word.height, height: word.width }
    : { width: word.width, height: word.height };
  return (
    <svg
      viewBox={`0 0 ${word.width} ${word.height}`}
      className="block size-full"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d={word.d}
        transform={
          word.turned ? `translate(0 ${drawn.width}) rotate(-90)` : undefined
        }
      />
    </svg>
  );
}

/**
 * The site's navigation in Aalim's handwriting (Step 110). In the app it's
 * a **menu** button drawn like **tree** and **account**, solid while open;
 * pressed, each of his five words flies out of it and grows into its
 * place in a tree (Step 133, `lib/nav-tree.ts`: why over what + how,
 * capitalism upright as the trunk, who and shh either side; the canopy
 * green, the trunk brown, the page you're on encircled),
 * centred on the screen, or down the left of the page from `xl`, and flies
 * back when it closes: Esc, a press
 * outside, the button again, or going to a page. On the home page and
 * the marketing pages the list stays open (from 1240px; narrower, they
 * work as the app does): it flies out once the page has loaded, and back
 * into the pile on leaving for the app. The list is drawn into the page's
 * body, since the header's blur would hold anything fixed inside it.
 */
export function SiteNavMenu({ className }: { className?: string }) {
  const pathname = usePathname();
  const roomForIt = useRoomForIt();
  /** Held open by the page it's on, not by a press. */
  const pinned = roomForIt && navHeldOpenOn(pathname);
  const [open, setOpen] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  /** Opened by a press: it takes focus, and has a way out. */
  const [byHand, setByHand] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const piled = React.useRef<(HTMLSpanElement | null)[]>([]);
  const listed = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const listId = React.useId();

  /** Where word `i` sits in the pile, as a transform from its list place. */
  const pileTransform = React.useCallback((i: number): string | null => {
    const from = piled.current[i]?.getBoundingClientRect();
    const to = listed.current[i]?.getBoundingClientRect();
    if (!from || !to || to.width === 0) return null;
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
  }, []);

  const still = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const close = React.useCallback(
    (refocus: boolean) => {
      if (!open || closing) return;
      // Back to the button at once, so no word leaves holding focus.
      if (refocus) trigger.current?.focus();
      const done = () => {
        setOpen(false);
        setClosing(false);
        setByHand(false);
      };
      if (still()) return done();
      setClosing(true);
      const flights = NAV_WORDS.map((_, i) => {
        const to = pileTransform(i);
        const el = listed.current[i];
        if (!to || !el) return null;
        return el.animate([{ transform: "none" }, { transform: to }], {
          duration: CLOSE_MS,
          delay: (NAV_WORDS.length - 1 - i) * (STAGGER_MS / 2),
          easing: CLOSE_EASING,
          fill: "forwards",
        }).finished;
      });
      // Whichever comes first: every word home, or the time that takes. A
      // hidden tab doesn't run animations, and the menu mustn't stay stuck
      // half closed.
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        done();
      };
      void Promise.all(flights).then(finish, finish);
      window.setTimeout(finish, CLOSE_MS + STAGGER_MS * NAV_WORDS.length + 100);
    },
    [open, closing, pileTransform],
  );

  // Out of the pile, once each time it opens: each word starts where it
  // sits in the pile, at its size there.
  const flown = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!open) {
      flown.current = false;
      return;
    }
    if (flown.current) return;
    flown.current = true;
    if (byHand) listed.current[0]?.focus({ preventScroll: true });
    if (still()) return;
    NAV_WORDS.forEach((_, i) => {
      const from = pileTransform(i);
      listed.current[i]?.animate([{ transform: from ?? "none" }, { transform: "none" }], {
        duration: OPEN_MS,
        delay: i * STAGGER_MS,
        easing: OPEN_EASING,
        fill: "backwards",
      });
    });
  }, [open, byHand, pileTransform]);

  // Esc closes it, back to the button.
  React.useEffect(() => {
    if (!open || !byHand) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, byHand, close]);

  // A marketing page opens it; leaving for the app, or going to any page
  // while it was opened by hand, puts the words back.
  const was = React.useRef({ pathname, pinned: false });
  React.useEffect(() => {
    const before = was.current;
    was.current = { pathname, pinned };
    if (pinned) {
      if (!before.pinned) holdOpen();
      return;
    }
    if (before.pinned || before.pathname !== pathname) close(false);

    function holdOpen() {
      setByHand(false);
      setOpen(true);
    }
  }, [pathname, pinned, close]);

  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        variant={open && !closing ? "default" : "outline"}
        aria-expanded={open && !closing}
        aria-controls={open ? listId : undefined}
        aria-label={open && !closing ? "Close menu" : undefined}
        // Held open, the list is the menu: the button's place stays, empty,
        // for the words to fly back to.
        aria-hidden={pinned || undefined}
        tabIndex={pinned ? -1 : undefined}
        onClick={() => {
          if (pinned) return;
          if (open) return close(false);
          setByHand(true);
          setOpen(true);
        }}
        className={cn("relative tap-target", pinned && "invisible", className)}
      >
        {/* The words, piled out of sight, so they fly from the button. */}
        {NAV_WORDS.map((word, i) => (
          <span
            key={word.id}
            ref={(el) => {
              piled.current[i] = el;
            }}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0"
            style={{
              width: word.width * PILE_SCALE,
              height: word.height * PILE_SCALE,
            }}
          />
        ))}
        <span className="hidden header-compact:contents">
          <Menu className="size-4" aria-hidden />
        </span>
        <span className="header-compact:sr-only">menu</span>
      </Button>

      {open
        ? createPortal(
            <>
              {/* Opened by hand, a press anywhere else closes it. Clear
                  where the page leaves the left side empty; below `xl` it
                  washes the page back so the words read over it. */}
              {byHand ? (
                <div
                  aria-hidden
                  onClick={() => close(false)}
                  className={cn(
                    "fixed inset-0 z-30 transition-opacity duration-300 animate-in fade-in-0 max-xl:bg-background/85 max-xl:backdrop-blur-sm",
                    closing && "opacity-0",
                  )}
                />
              ) : null}
              <nav
                id={listId}
                aria-label="Site"
                className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 text-foreground xl:left-14 xl:translate-x-0"
                style={{
                  width: NAV_TREE_SIZE.width * LIST_SCALE,
                  height: NAV_TREE_SIZE.height * LIST_SCALE,
                }}
              >
                <ul>
                  {NAV_WORDS.map((word, i) => (
                    <li key={word.id}>
                      <Link
                        ref={(el) => {
                          listed.current[i] = el;
                        }}
                        href={word.href}
                        aria-label={word.label}
                        aria-current={pathname === word.href ? "page" : undefined}
                        // The tree's canopy is green, its trunk brown; the
                        // page you're on is encircled, in the word's ink.
                        className={cn(
                          "absolute block origin-top-left rounded-full outline-none transition-[rotate] duration-200 hover:-rotate-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background aria-[current=page]:outline-2 aria-[current=page]:outline-solid aria-[current=page]:outline-offset-6 aria-[current=page]:outline-current",
                          word.part === "canopy"
                            ? "text-brand-green"
                            : "text-brand-brown",
                        )}
                        style={{
                          left: word.x * LIST_SCALE,
                          top: word.y * LIST_SCALE,
                          width: word.width * LIST_SCALE,
                          height: word.height * LIST_SCALE,
                        }}
                      >
                        <Word word={word} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
