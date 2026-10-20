package dev.salman.backend.dto;

import dev.salman.backend.lib.ValidMessageBody;

public record EditMessageRequest(@ValidMessageBody String body) {
}
