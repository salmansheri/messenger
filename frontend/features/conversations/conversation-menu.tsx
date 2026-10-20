"use client";

import { useCallback, useState } from "react";
import { DotsIcon, DropdownMenu, MenuItem, useCloseMenu } from "@/components/ui/dropdown-menu";
import { toProblem, type ConversationResponse, type UpdateSettingsRequest } from "@/lib/api";
import { isMuted } from "./settings";
import { useUpdateSettings } from "./use-update-settings";
import { settingsFailureMessage } from "./wording";

/**
 * What the person can do with this Conversation for themselves: mute it (for 8 hours, a week or for ever), archive it,
 * pin it. They are private to the person and the same on all of their devices. When the server refuses (a fourth pin,
 * pinning an archived Conversation) the menu stays open and says why in its own words.
 */
export function ConversationMenu({ conversation }: { conversation: ConversationResponse }) {
  const [problem, setProblem] = useState<string>();
  const forgetProblem = useCallback(() => setProblem(undefined), []);
  return (
    <DropdownMenu
      label="Options for this Conversation"
      icon={<DotsIcon />}
      onClose={forgetProblem}
      below={
        problem && (
          <p role="alert" className="px-3 py-2 text-sm text-accent">
            {problem}
          </p>
        )
      }
    >
      <Choices conversation={conversation} onProblem={setProblem} />
    </DropdownMenu>
  );
}

function Choices({ conversation, onProblem }: { conversation: ConversationResponse; onProblem: (message: string | undefined) => void }) {
  const conversationId = conversation.id ?? "";
  const close = useCloseMenu();
  const update = useUpdateSettings();
  const settings = conversation.settings;
  const muted = isMuted(settings, new Date());

  function choose(body: UpdateSettingsRequest) {
    onProblem(undefined);
    update.mutate(
      { path: { conversationId }, body },
      { onSuccess: () => close(true), onError: (error) => onProblem(settingsFailureMessage(toProblem(error))) },
    );
  }

  return (
    <>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "EIGHT_HOURS" })}>
        Mute for 8 hours
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "ONE_WEEK" })}>
        Mute for a week
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "ALWAYS" })}>
        Mute always
      </MenuItem>
      {muted && (
        <MenuItem busy={update.isPending} onSelect={() => choose({ mute: "NONE" })}>
          Unmute
        </MenuItem>
      )}
      <MenuItem busy={update.isPending} onSelect={() => choose({ archived: !settings?.archived })}>
        {settings?.archived ? "Unarchive" : "Archive"}
      </MenuItem>
      <MenuItem busy={update.isPending} onSelect={() => choose({ pinned: !settings?.pinned })}>
        {settings?.pinned ? "Unpin" : "Pin"}
      </MenuItem>
    </>
  );
}
