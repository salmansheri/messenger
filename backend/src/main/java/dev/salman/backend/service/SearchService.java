package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.SearchPage;

/** Search: finding Messages by the words in their text or caption, among those the caller may read. */
public interface SearchService {

	/** Results per page. */
	int PAGE_SIZE = 20;

	/**
	 * The caller's Messages in one Conversation that match {@code query}, newest first, {@value #PAGE_SIZE} at a time:
	 * never a Message deleted for everyone, one the caller hid for themselves or one from before they joined. Matching
	 * ignores case and accents, never cuts a word to a stem, and takes the last word as a prefix; any text is a valid
	 * query (one that means nothing, or only excludes, finds nothing). Every accepted call counts against the caller's
	 * search allowance.
	 *
	 * @param before the {@code messageId} of the last result already shown, for the next page; null for the first
	 * @throws dev.salman.backend.exception.NotFoundException when the caller is not a Participant
	 * @throws dev.salman.backend.exception.BadRequestException when {@code before} is not a Message of the
	 *         Conversation
	 * @throws dev.salman.backend.exception.RateLimitedException when the caller searches too often
	 */
	SearchPage searchConversation(UUID callerId, UUID conversationId, String query, UUID before);

	/**
	 * The same search across every Conversation the caller is a Participant of now, each with its own join point;
	 * results carry their {@code conversationId}. Conversations they left or were removed from are not searched. It
	 * shares the search allowance with {@link #searchConversation}.
	 *
	 * @param before the {@code messageId} of the last result already shown, for the next page; null for the first
	 * @throws dev.salman.backend.exception.BadRequestException when {@code before} is not a Message (it is used only as
	 *         a position, so one from a Conversation the caller has since left keeps the paging going)
	 * @throws dev.salman.backend.exception.RateLimitedException when the caller searches too often
	 */
	SearchPage searchAll(UUID callerId, String query, UUID before);

}
