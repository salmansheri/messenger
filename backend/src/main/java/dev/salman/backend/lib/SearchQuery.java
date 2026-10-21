package dev.salman.backend.lib;

import java.util.regex.Pattern;

/**
 * What someone typed into Search, split for PostgreSQL: {@code words} goes to {@code websearch_to_tsquery} (which
 * accepts any text, so quotes, {@code -} and {@code or} work and odd characters never cause an error), and the last
 * word, while it is still being typed, becomes {@code prefix}, a {@code to_tsquery} text like {@code 'meet':*} so
 * "meet" finds "meeting". The prefix is built only from letters, digits and combining marks, so nothing typed can
 * break out of its quotes; it is empty when there is no such word at the end, or when the word is negated
 * ({@code -word}) or inside an open quote, or when the text uses {@code or} (the prefix would be joined to the rest
 * with "and", so "lunch or din" would need both): {@code websearch_to_tsquery} then handles it all as typed.
 */
public record SearchQuery(String words, String prefix) {

	private static final Pattern LAST_WORD = Pattern.compile("[\\p{L}\\p{N}\\p{M}]+$");

	private static final Pattern LETTER_OR_DIGIT = Pattern.compile("[\\p{L}\\p{N}]");

	/** The word {@code or} on its own, which {@code websearch_to_tsquery} reads as "either". */
	private static final Pattern OR = Pattern.compile("(?i)(^|\\s)or(\\s|$)");

	public static SearchQuery parse(String typed) {
		var text = typed.strip();
		var last = LAST_WORD.matcher(text);
		if (!last.find() || !LETTER_OR_DIGIT.matcher(last.group()).find()) {
			return new SearchQuery(text, "");
		}
		var start = last.start();
		var negated = start > 0 && text.charAt(start - 1) == '-'
				&& (start == 1 || Character.isWhitespace(text.charAt(start - 2)));
		var inQuote = text.substring(0, start).chars().filter(c -> c == '"').count() % 2 == 1;
		if (negated || inQuote || OR.matcher(text.substring(0, start)).find()) {
			return new SearchQuery(text, "");
		}
		return new SearchQuery(text.substring(0, start), "'" + last.group() + "':*");
	}

}
