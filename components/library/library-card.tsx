"use client";

import Link from "next/link";

import { LeafCard } from "@/components/tree/leaf-card";
import { blogExcerpt, blogPostHref, coverPhotoUrl, type BlogPerson, type BlogPost } from "@/lib/blog";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import { cn } from "@/lib/utils";

export type LibraryCardPost = Pick<
  BlogPost,
  "slug" | "title" | "body" | "kind" | "people" | "coverPath"
>;

/**
 * A profiled person as the canvas would draw them: only their name, maiden
 * name and birthplace (no dates, so no years; not marked deceased, so the
 * blade says nothing more of them). The blade names the birthplace where
 * the years would be (Step 158).
 */
function entryOf(person: BlogPerson, id: string) {
  return marketingEntry({
    id,
    first: person.first,
    last: person.last,
    maiden: person.maiden || null,
    city: person.place,
    country: "",
    account: null,
  });
}

/**
 * A post on /library (Step 135): the people it profiles as their leaves,
 * each the species its birthplace gives it, as the app draws them — one
 * for a person, two for a couple, a cluster for a family. Hovering (or
 * focusing) lays the cover photo, the title and the first words over all
 * of the leaves; the whole card opens the post. Where there's no hover (a
 * phone), the title sits under the leaves instead. Since Step 154 the
 * cover runs across the top of that overlay, a 16:9 picture with the title
 * and the first words under it. Since Step 158 it's a small card that
 * leaves the leaves showing: beside them from `lg`, where the column has
 * room on the right, and just under them below that.
 */
export function LibraryCard({
  post,
  href,
  coverUrl,
  className,
}: {
  post: LibraryCardPost;
  /** The post's page, unless the card is a preview going nowhere. */
  href?: string | null;
  /** The editor's preview: a cover just picked, not yet stored. */
  coverUrl?: string | null;
  className?: string;
}) {
  const people = post.people.length ? post.people : null;
  const cover = coverUrl === undefined ? coverPhotoUrl(post.coverPath) : coverUrl;
  const excerpt = blogExcerpt(post.body, 220);
  const inner = (
    <>
      <div
        className={cn(
          "flex flex-wrap items-start justify-center gap-x-3 gap-y-8 px-3 py-7",
          post.kind === "family" && "max-w-[28rem]",
        )}
      >
        {people ? (
          people.map((p, i) => {
            const entry = entryOf(p, `${post.slug}-${i}`);
            return (
              <LeafCard
                key={entry.id}
                person={entry}
                leaf={nativeLeaf(entry)}
                selected={false}
                isSelf={false}
                quiet
                place={p.place}
              />
            );
          })
        ) : (
          <LeafCard
            person={entryOf({ first: "", last: "", maiden: "", place: "" }, post.slug)}
            leaf={nativeLeaf({ city_of_birth: "" })}
            selected={false}
            isSelf={false}
            quiet
            label={post.title}
          />
        )}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-[calc(100%-0.5rem)] left-1/2 z-10 flex w-56 -translate-x-1/2 flex-col gap-2 rounded-xl border bg-popover/95 p-2 opacity-0 shadow-xl transition-opacity duration-200 group-hover/post:opacity-100 group-focus-visible/post:opacity-100 lg:top-1/2 lg:left-full lg:ml-2 lg:translate-x-0 lg:-translate-y-1/2"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="aspect-video w-full shrink-0 rounded-md object-cover"
          />
        ) : null}
        <div className="min-w-0 px-1 text-left">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{post.title}</p>
          {excerpt ? (
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{excerpt}</p>
          ) : null}
        </div>
      </div>
      <p className="hidden px-3 pb-3 text-center text-sm font-medium [@media(hover:none)]:block">
        {post.title}
      </p>
    </>
  );
  const classes = cn(
    "group/post relative block w-fit max-w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  return href === null ? (
    <div className={classes}>{inner}</div>
  ) : (
    <Link href={href ?? blogPostHref(post.slug)} className={classes}>
      <span className="sr-only">{post.title}</span>
      {inner}
    </Link>
  );
}
