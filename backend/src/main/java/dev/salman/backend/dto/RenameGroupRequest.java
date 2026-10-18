package dev.salman.backend.dto;

import dev.salman.backend.lib.ValidGroupName;

public record RenameGroupRequest(@ValidGroupName String name) {
}
