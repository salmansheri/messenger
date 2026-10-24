package dev.salman.backend.dto;

import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.entity.StoryTone;
import dev.salman.backend.lib.ValidStoryText;
import jakarta.validation.constraints.NotNull;

/** A text Story: its words and the tone they are shown on. */
public record PostStoryRequest(@NotNull StoryKind kind, @ValidStoryText String text, @NotNull StoryTone tone) {
}
