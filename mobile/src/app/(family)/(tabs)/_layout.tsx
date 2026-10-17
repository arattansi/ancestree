import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import * as React from "react";

import { useSession } from "@/auth/session";
import { useNoticesWake } from "@/feed/notices";
import {
  FeedButton,
  HomeButton,
  MenuBar,
  MessagesButton,
  RecordButton,
  YouButton,
} from "@/ui/menu-bar";

/**
 * The member's main screens behind the menu bar (Step 179.4): the leaf view
 * (home), the feed, messages and settings. Everything else opens over them
 * from the family's stack.
 */
export default function TabsLayout() {
  const { session } = useSession();
  useNoticesWake(!!session);
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <MenuBar>
          <RecordButton />
          <TabTrigger name="feed" href="/feed" asChild>
            <FeedButton />
          </TabTrigger>
          <TabTrigger name="index" href="/" asChild>
            <HomeButton />
          </TabTrigger>
          <TabTrigger name="messages" href="/messages" asChild>
            <MessagesButton />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <YouButton />
          </TabTrigger>
        </MenuBar>
      </TabList>
    </Tabs>
  );
}
