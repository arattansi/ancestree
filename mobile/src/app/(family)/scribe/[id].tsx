import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";

import { useFamily } from "@/family/family";
import { Scribe } from "@/scribe/scribe";

/** The scribe, on someone's leaf (Step 148). */
export default function ScribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  if (state.status !== "ready") return null;
  return (
    <Scribe family={state.family} personId={id} onClose={() => router.back()} />
  );
}
