"use client";

import * as React from "react";
import {
  useStore,
  ViewportPortal,
  type ReactFlowState,
} from "@xyflow/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import { personDisplayName, personInitials } from "@/lib/person-name";
import { placePoint, type Peer } from "@/lib/presence";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

import type { CursorStore } from "./use-tree-room";

const zoomOf = (s: ReactFlowState) => s.transform[2];
const lookupOf = (s: ReactFlowState) => s.nodeLookup;

/**
 * The others' pointers on the canvas (Step 57.3), each in their colour with
 * their name, beside the card they're by. The same size at any zoom, and
 * above the cards; a pointer whose card isn't drawn here isn't shown.
 */
export function LiveCursors({
  cursors,
  peers,
  colours,
}: {
  cursors: CursorStore;
  peers: readonly Peer[];
  colours: ReadonlyMap<string, string>;
}) {
  const points = React.useSyncExternalStore(
    cursors.subscribe,
    cursors.get,
    cursors.get,
  );
  const zoom = useStore(zoomOf);
  const nodes = useStore(lookupOf);
  const names = React.useMemo(
    () => new Map(peers.map((p) => [p.userId, p.name])),
    [peers],
  );

  return (
    <ViewportPortal>
      {[...points].map(([userId, point]) => {
        const at = placePoint(point, (id) => {
          const node = nodes.get(id);
          return node && !node.hidden ? node.internals.positionAbsolute : null;
        });
        const colour = colours.get(userId);
        if (!at || !colour) return null;
        return (
          <div
            key={userId}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 transition-transform duration-[120ms] ease-linear"
            style={{
              transform: `translate(${at.x}px, ${at.y}px) scale(${1 / zoom})`,
              transformOrigin: "0 0",
              zIndex: 2000,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              className="drop-shadow-sm"
            >
              <path
                d="M1.5 1.5 L16 8 L9.5 9.5 L7 16 Z"
                fill={colour}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute top-4 left-3 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-white shadow-sm"
              style={{ backgroundColor: colour }}
            >
              {names.get(userId) || "Someone"}
            </span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}

/**
 * Who else has the tree open, as a row of faces above **Upcoming**. A
 * face goes to their pointer, or to their card while their pointer is off
 * the canvas; someone whose tab is in the background is dimmed.
 */
export function PresenceFaces({
  peers,
  colours,
  personById,
  onGoTo,
}: {
  peers: readonly Peer[];
  colours: ReadonlyMap<string, string>;
  personById: ReadonlyMap<string, TreeGraphPerson>;
  onGoTo: (peer: Peer) => void;
}) {
  if (peers.length === 0) return null;
  const MAX = 5;
  const shown = peers.slice(0, MAX);
  const more = peers.length - shown.length;
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={`Also here: ${peers.map((p) => p.name || "someone").join(", ")}`}
    >
      {shown.map((peer) => {
        const person = peer.person ? personById.get(peer.person) : undefined;
        const name = person ? personDisplayName(person) : peer.name;
        const label = peer.away ? `${name} (away)` : name;
        return (
          <button
            key={peer.userId}
            type="button"
            onClick={() => onGoTo(peer)}
            title={label}
            aria-label={`Go to ${label}`}
            className={cn(
              "rounded-full ring-2 ring-offset-2 ring-offset-background transition-opacity",
              peer.away && "opacity-50",
            )}
            style={
              {
                "--tw-ring-color": colours.get(peer.userId),
              } as React.CSSProperties
            }
          >
            <Avatar className="size-7 overflow-hidden">
              {person?.photo_card_url ? (
                <AvatarImage
                  src={person.photo_card_url}
                  alt=""
                  style={cropStyle(parseCrop(person.photo_crop))}
                />
              ) : null}
              <AvatarFallback
                className="text-[10px] font-medium text-white"
                style={{ backgroundColor: colours.get(peer.userId) }}
              >
                {person
                  ? personInitials(person)
                  : (peer.name.trim()[0] ?? "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        );
      })}
      {more > 0 ? (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
          +{more}
        </span>
      ) : null}
    </div>
  );
}
