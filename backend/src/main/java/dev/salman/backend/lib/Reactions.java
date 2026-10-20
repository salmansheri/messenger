package dev.salman.backend.lib;

import java.util.List;
import java.util.Optional;

/** The six reactions a Participant can put on a Message: thumbs up, heart, laughing, surprised, sad and folded hands. */
public final class Reactions {

	/** In the order they are offered and listed. The heart carries its variation selector, as it is usually typed. */
	public static final List<String> ALLOWED = List.of("\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E",
			"\uD83D\uDE22", "\uD83D\uDE4F");

	private static final String VARIATION_SELECTOR = "\uFE0F";

	private Reactions() {
	}

	/** The reaction as it is stored, if the text is one of the six (a heart with or without its selector counts). */
	public static Optional<String> canonical(String emoji) {
		if (emoji == null) {
			return Optional.empty();
		}
		var bare = emoji.replace(VARIATION_SELECTOR, "");
		return ALLOWED.stream().filter(allowed -> allowed.replace(VARIATION_SELECTOR, "").equals(bare)).findFirst();
	}

}
