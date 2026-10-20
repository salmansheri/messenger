package dev.salman.backend.lib;

/** The start of a text, for places that show only a glimpse of a Message (a push notification, a quote). */
public final class Previews {

	private Previews() {
	}

	/** The first {@code characters} characters (counted as Unicode code points) of the text, with an ellipsis if it was cut. */
	public static String firstCharacters(String text, int characters) {
		if (text.codePointCount(0, text.length()) <= characters) {
			return text;
		}
		return text.substring(0, text.offsetByCodePoints(0, characters)) + "\u2026";
	}

}
