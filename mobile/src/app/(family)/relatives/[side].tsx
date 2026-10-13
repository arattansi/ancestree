import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";

import { ORBIT_SIDES, type OrbitSide } from "@/lib/leaf-orbit";
import { relativesOf, useFamily } from "@/family/family";
import { GROUP_NAMES } from "@/family/words";
import { PeopleList } from "@/ui/people-list";

/** Everyone in a group too big for its circles: behind the "+n" one. */
export default function RelativesSheet() {
  const { side } = useLocalSearchParams<{ side: string }>();
  const { state, focusId, walkTo } = useFamily();
  if (state.status !== "ready" || !focusId) return null;
  if (!ORBIT_SIDES.includes(side as OrbitSide)) return null;
  const group = side as OrbitSide;
  const ids = relativesOf(state.family, focusId)[group];

  return (
    <PeopleList
      title={GROUP_NAMES[group]}
      people={ids.flatMap((id) => state.family.people.get(id) ?? [])}
      onPick={(id) => {
        router.back();
        walkTo(id);
      }}
    />
  );
}
