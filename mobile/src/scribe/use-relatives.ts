import * as React from "react";

import { accountTypeOf, isAccountTypeKey } from "@/lib/account-types";
import type {
  DetectionTree,
  ImpliedConnection,
} from "@/lib/connection-suggestions";
import type { AskAdult } from "@/lib/minors";
import type { RelativeProposal } from "@/lib/scribe-facts";
import {
  asksAdult,
  questionKey,
  relativeDraft,
  relativeInviteAddress,
  relativeName,
  relativeQuestions,
  relativeStatus,
  relativeSuggestions,
  sameAs,
  type Judged,
  type RelativeDraft,
  type RelativeMade,
  type RelativeStatus,
} from "@/lib/scribe-relatives";
import { supabase } from "@/auth/supabase";
import type { Family } from "@/family/load";
import { addRelative, judge, loadDetectionTree } from "@/scribe/relatives";
import { inviteToClaim } from "@/scribe/story";

/** One relative the scribe found, as its card shows it. */
export type RelativeView = {
  r: RelativeProposal;
  draft: RelativeDraft;
  ticked: boolean;
  /** "Is {name} 18 or older?" is asked of them. */
  asksAdult: boolean;
  /** The connections the tree implies; null while it's read. */
  questions: ImpliedConnection[] | null;
  /** Those on the tree the database asks about. */
  asks: AskAdult[];
  /** The database is being asked. */
  checking: boolean;
  /** It couldn't be asked: to try again. */
  checkFailed: boolean;
  /**
   * They may be tagged in the story (148.5): the member is a Root of the
   * tree it's told on, and they'd be added on that tree.
   */
  canTag: boolean;
  status: RelativeStatus;
};

type Check = { key: string; judged: Judged | "failed" };

/** Where the tree someone joins is read from, or not yet. */
type TreeRead = DetectionTree | "failed";

/**
 * The relatives the scribe found that aren't on the tree (Step 148.3):
 * which are ticked, their names as edited, the answers given, and what the
 * database says to adding each. Nothing is written until `addTicked`, once
 * the story's saved. `storyTree` is the tree the story is told on.
 */
export function useRelatives(
  family: Family,
  proposals: RelativeProposal[],
  storyTree: string | null,
) {
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = React.useState<Record<string, RelativeDraft>>({});
  const [trees, setTrees] = React.useState<Record<string, TreeRead>>({});
  const [checks, setChecks] = React.useState<Record<string, Check>>({});
  const reading = React.useRef(new Set<string>());
  const asking = React.useRef(new Map<string, string>());
  const today = React.useMemo(() => new Date(), []);
  /** Whether the member is a Root of the story's tree: only a Root tags (148.5). */
  const [rootOfStory, setRootOfStory] = React.useState(false);

  React.useEffect(() => {
    if (!storyTree) return;
    let live = true;
    void supabase
      .from("my_trees")
      .select("role")
      .eq("id", storyTree)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const role = data?.role;
        setRootOfStory(
          !!role && isAccountTypeKey(role) && accountTypeOf(role).runsTree,
        );
      });
    return () => {
      live = false;
    };
  }, [storyTree]);

  /** A relative is added on the first tree of the member's showing whom they're named for. */
  const treeOf = React.useCallback(
    (r: RelativeProposal) => family.people.get(r.ofId)?.fullOn[0] ?? null,
    [family],
  );

  const views: RelativeView[] = React.useMemo(
    () =>
      proposals.map((r) => {
        const draft = drafts[r.key] ?? relativeDraft(r);
        const treeId = treeOf(r);
        const read = treeId ? trees[treeId] : undefined;
        const tree = read && read !== "failed" ? read : null;
        // Looking for implied connections never stops an add (as on the
        // web): a tree that couldn't be read asks nothing.
        const questions =
          !treeId || read === "failed"
            ? []
            : tree
              ? relativeQuestions(r, draft, tree)
              : null;
        const check = checks[r.key];
        const key = checkKey(r, draft, treeId, questions, tree);
        const current = check && check.key === key ? check.judged : null;
        // Who the last check asked about, kept while the next one runs.
        const asks =
          check && check.judged !== "failed" ? check.judged.asks : [];
        const status: RelativeStatus = !treeId
          ? { at: "refused", why: "They can only be added on your own tree." }
          : relativeStatus({
              r,
              draft,
              selfId: family.selfId,
              questions,
              tree,
              asks,
              judged: current === "failed" ? null : current,
              today,
            });
        return {
          r,
          draft,
          ticked: ticked.has(r.key),
          asksAdult: asksAdult(r, family.selfId, today),
          questions,
          asks,
          checking: !!key && !current,
          checkFailed: current === "failed",
          canTag: rootOfStory && !!treeId && treeId === storyTree,
          status,
        };
      }),
    [
      proposals,
      drafts,
      treeOf,
      trees,
      checks,
      family.selfId,
      ticked,
      today,
      rootOfStory,
      storyTree,
    ],
  );

  // Each ticked relative's tree, read once.
  React.useEffect(() => {
    for (const v of views) {
      const treeId = v.ticked ? treeOf(v.r) : null;
      if (!treeId || trees[treeId] || reading.current.has(treeId)) continue;
      reading.current.add(treeId);
      loadDetectionTree(supabase, treeId)
        .then((tree): TreeRead => tree)
        .catch((): TreeRead => "failed")
        .then((read) => setTrees((all) => ({ ...all, [treeId]: read })))
        .finally(() => reading.current.delete(treeId));
    }
  }, [views, treeOf, trees]);

  // The database asked about each ticked relative once their names are in
  // and the questions answered, and again whenever an answer draws a line.
  React.useEffect(() => {
    for (const v of views) {
      if (!v.ticked) continue;
      const treeId = treeOf(v.r);
      const tree = treeId ? trees[treeId] : undefined;
      const key = checkKey(
        v.r,
        v.draft,
        treeId,
        v.questions,
        tree && tree !== "failed" ? tree : null,
      );
      if (
        !key ||
        !treeId ||
        checks[v.r.key]?.key === key ||
        asking.current.get(v.r.key) === key
      ) {
        continue;
      }
      asking.current.set(v.r.key, key);
      const suggestions = relativeSuggestions(
        v.questions ?? [],
        v.draft.answers,
      );
      // Asked afresh each time: a line an answer no longer draws asks
      // nothing.
      judge(supabase, v.r, v.draft, treeId, suggestions, [])
        .catch((): Judged | "failed" => "failed")
        .then((judged) =>
          setChecks((all) => ({ ...all, [v.r.key]: { key, judged } })),
        )
        .finally(() => {
          if (asking.current.get(v.r.key) === key)
            asking.current.delete(v.r.key);
        });
    }
  }, [views, treeOf, trees, checks]);

  function toggle(key: string) {
    setTicked((on) => {
      const next = new Set(on);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function edit(r: RelativeProposal, patch: Partial<RelativeDraft>) {
    setDrafts((all) => {
      const draft = all[r.key] ?? relativeDraft(r);
      return {
        ...all,
        [r.key]: {
          ...draft,
          ...patch,
          answers: { ...draft.answers, ...patch.answers },
          existing: { ...draft.existing, ...patch.existing },
        },
      };
    });
  }

  /** Ask the database again, after it couldn't be asked. */
  function retry(r: RelativeProposal) {
    setChecks((all) => {
      const { [r.key]: _gone, ...rest } = all;
      return rest;
    });
  }

  /**
   * Why the story can't be saved yet for a ticked relative, or null: a
   * name or an answer missing, or someone ticked who can't be added.
   */
  function problem(): string | null {
    for (const v of views) {
      if (!v.ticked) continue;
      if (v.status.at === "refused") {
        return `${relativeName(v.draft)} can’t be added. Untick them to save.`;
      }
      if (v.status.at === "waiting") {
        return v.checkFailed
          ? `Couldn’t check ${relativeName(v.draft)}. Try again.`
          : v.status.why;
      }
    }
    return null;
  }

  /**
   * Add each ticked relative who's ready, one after another, and invite
   * those given an address to claim their entry once it's there (148.4):
   * how each went. An invite that doesn't go never undoes the add.
   */
  async function addTicked(): Promise<RelativeMade[]> {
    const made: RelativeMade[] = [];
    for (const v of views) {
      const treeId = treeOf(v.r);
      if (!v.ticked || v.status.at !== "ready" || !treeId) continue;
      const name = relativeName(v.draft);
      const added = await addRelative(supabase, {
        r: v.r,
        draft: v.draft,
        treeId,
        suggestions: relativeSuggestions(v.questions ?? [], v.draft.answers),
        adult: v.asksAdult ? v.draft.adult : null,
        adultIds: v.asks.filter((a) => v.draft.existing[a.id]).map((a) => a.id),
      }).catch(() => ({ error: "Couldn’t add them." }));
      if ("error" in added) {
        made.push({ name, error: added.error });
        continue;
      }
      const email = relativeInviteAddress(v.r, v.draft);
      const invite = email
        ? await inviteToClaim({ personId: added.id, email, treeId })
        : null;
      made.push({
        name,
        error: null,
        id: added.id,
        tag: v.canTag && v.draft.tag,
        ...(invite && "invited" in invite ? { invited: invite.invited } : {}),
        ...(invite && "error" in invite ? { inviteError: invite.error } : {}),
      });
    }
    return made;
  }

  return { views, toggle, edit, retry, problem, addTicked };
}

/**
 * What the database is asked about a relative: their tree and the answered
 * questions' lines. Null until it's worth asking: names in, every question
 * answered, and not someone the member said is on the tree already.
 */
function checkKey(
  r: RelativeProposal,
  draft: RelativeDraft,
  treeId: string | null,
  questions: ImpliedConnection[] | null,
  tree: DetectionTree | null,
): string | null {
  if (!treeId || !questions) return null;
  if (!draft.firstName.trim() || !draft.lastName.trim()) return null;
  if (questions.some((q) => !draft.answers[questionKey(q)])) return null;
  if (tree && sameAs(questions, draft, tree)) return null;
  return JSON.stringify([
    treeId,
    relativeSuggestions(questions, draft.answers),
  ]);
}
