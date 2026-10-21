package dev.salman.backend.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.LinkedHashMap;
import java.util.Map;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Drives the public auth endpoints and reads Verification codes from the recorded emails. */
public class AuthClient {

	public static final String PASSWORD = "correct-horse-battery";
	public static final String REFRESH_COOKIE = "refresh_token";

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");
	private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

	private final MockMvc mvc;
	private final JsonMapper json;
	private final RecordingEmailSender emails;

	/** Every client gets its own remote address, so per-IP rate limits never leak between tests. */
	private final String ip = "10.%d.%d.%d".formatted(NEXT_IP.get() / 65025 % 255, NEXT_IP.get() / 255 % 255,
			NEXT_IP.getAndIncrement() % 255 + 1);

	public AuthClient(MockMvc mvc, JsonMapper json, RecordingEmailSender emails) {
		this.mvc = mvc;
		this.json = json;
		this.emails = emails;
	}

	public static String uniqueEmail() {
		return "user-" + UUID.randomUUID() + "@example.com";
	}

	public ResultActions signUp(String email) throws Exception {
		return signUp(email, "Ada Lovelace", PASSWORD);
	}

	public ResultActions signUp(String email, String displayName, String password) throws Exception {
		return postJson("/api/v1/auth/signup", Map.of("email", email, "displayName", displayName, "password", password));
	}

	public ResultActions verifyEmail(String email, String code) throws Exception {
		return postJson("/api/v1/auth/verify-email", Map.of("email", email, "code", code));
	}

	public ResultActions resendVerification(String email) throws Exception {
		return postJson("/api/v1/auth/resend-verification", Map.of("email", email));
	}

	public ResultActions forgotPassword(String email) throws Exception {
		return postJson("/api/v1/auth/forgot-password", Map.of("email", email));
	}

	public ResultActions resetPassword(String email, String code, String newPassword) throws Exception {
		return postJson("/api/v1/auth/reset-password",
				Map.of("email", email, "code", code, "newPassword", newPassword));
	}

	public ResultActions login(String email, String password) throws Exception {
		return postJson("/api/v1/auth/login", Map.of("email", email, "password", password));
	}

	public ResultActions refresh(String refreshToken) throws Exception {
		return postWithCookie("/api/v1/auth/refresh", refreshToken, null);
	}

	public ResultActions refreshFromOrigin(String refreshToken, String origin) throws Exception {
		return postWithCookie("/api/v1/auth/refresh", refreshToken, origin);
	}

	public ResultActions refreshWithoutCookie() throws Exception {
		return postWithCookie("/api/v1/auth/refresh", null, null);
	}

	public ResultActions logout(String refreshToken) throws Exception {
		return postWithCookie("/api/v1/auth/logout", refreshToken, null);
	}

	public ResultActions logoutDevice(String refreshToken, Object deviceId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/auth/logout").with(req -> {
			req.setRemoteAddr(ip);
			return req;
		}).cookie(new jakarta.servlet.http.Cookie(REFRESH_COOKIE, refreshToken)).contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("deviceId", deviceId))));
	}

	public ResultActions logoutWithoutCookie() throws Exception {
		return postWithCookie("/api/v1/auth/logout", null, null);
	}

	private ResultActions postWithCookie(String path, String refreshToken, String origin) throws Exception {
		var request = MockMvcRequestBuilders.post(path).with(req -> {
			req.setRemoteAddr(ip);
			return req;
		});
		if (refreshToken != null) {
			request.cookie(new jakarta.servlet.http.Cookie(REFRESH_COOKIE, refreshToken));
		}
		if (origin != null) {
			request.header("Origin", origin);
		}
		return mvc.perform(request);
	}

	/** The raw Set-Cookie header for the refresh cookie, or null when the response did not set it. */
	public static String refreshSetCookie(ResultActions result) {
		return result.andReturn().getResponse().getHeaders("Set-Cookie").stream()
				.filter(h -> h.startsWith(REFRESH_COOKIE + "=")).findFirst().orElse(null);
	}

	public static String refreshCookieValue(ResultActions result) {
		var header = refreshSetCookie(result);
		if (header == null) {
			throw new AssertionError("No " + REFRESH_COOKIE + " cookie was set");
		}
		return header.substring((REFRESH_COOKIE + "=").length()).split(";", 2)[0];
	}

	public ResultActions me(String accessToken) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/users/me").header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions lookup(String accessToken, String email) throws Exception {
		return lookupBody(accessToken, Map.of("email", email));
	}

	public ResultActions lookupBody(String accessToken, Object body) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/users/lookup").contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(body)).header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions lookupWithoutToken(String email) throws Exception {
		return postJson("/api/v1/users/lookup", Map.of("email", email));
	}

	/** The id of a User, as that User sees it on their own profile. */
	public String idOf(String email) throws Exception {
		var profile = me(loginForTokens(email, PASSWORD).accessToken()).andReturn().getResponse().getContentAsString();
		return json.readTree(profile).get("id").asString();
	}

	/** A verified, signed-in account: its email, User id and access token. */
	public record Account(String email, String id, String accessToken) {
	}

	public Account account(String displayName) throws Exception {
		var email = uniqueEmail();
		registerVerified(email, displayName, PASSWORD);
		var token = loginForTokens(email, PASSWORD).accessToken();
		var profile = me(token).andReturn().getResponse().getContentAsString();
		return new Account(email, json.readTree(profile).get("id").asString(), token);
	}

	public ResultActions startDirect(String accessToken, Object userId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/direct")
				.contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("userId", userId)))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions conversations(String accessToken) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/conversations")
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions send(String accessToken, String conversationId, Object clientMessageId, String body)
			throws Exception {
		return sendBody(accessToken, conversationId, Map.of("clientMessageId", clientMessageId, "body", body));
	}

	public ResultActions sendBody(String accessToken, String conversationId, Object requestBody) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/messages", conversationId)
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(requestBody))
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Changes the caller's display name. */
	public ResultActions changeDisplayName(String accessToken, Object displayName) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("displayName", displayName);
		return mvc.perform(MockMvcRequestBuilders.patch("/api/v1/users/me").contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(body)).header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions editMessage(String accessToken, String conversationId, String messageId, String body)
			throws Exception {
		return mvc.perform(MockMvcRequestBuilders.patch("/api/v1/conversations/{id}/messages/{messageId}",
				conversationId, messageId).contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("body", body)))
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Sets (or replaces) the caller's reaction to a message. */
	public ResultActions react(String accessToken, String conversationId, String messageId, String emoji)
			throws Exception {
		return mvc.perform(MockMvcRequestBuilders.put("/api/v1/conversations/{id}/messages/{messageId}/reaction",
				conversationId, messageId).contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("emoji", emoji)))
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Takes the caller's reaction to a message away. */
	public ResultActions unreact(String accessToken, String conversationId, String messageId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.delete("/api/v1/conversations/{id}/messages/{messageId}/reaction",
				conversationId, messageId).header("Authorization", "Bearer " + accessToken));
	}

	/** Sends a new message that quotes another one of the same conversation. */
	public ResultActions sendReply(String accessToken, String conversationId, Object clientMessageId, String body,
			Object replyToMessageId) throws Exception {
		return sendBody(accessToken, conversationId,
				Map.of("clientMessageId", clientMessageId, "body", body, "replyToMessageId", replyToMessageId));
	}

	/** Changes the caller's own mute, archive and pin settings for a Conversation; absent keys stay as they are. */
	public ResultActions updateSettings(String accessToken, String conversationId, Map<String, Object> settings)
			throws Exception {
		return mvc.perform(MockMvcRequestBuilders.patch("/api/v1/conversations/{id}/settings", conversationId)
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(settings))
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Deletes the Message for everyone. */
	public ResultActions deleteMessage(String accessToken, String conversationId, String messageId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.delete("/api/v1/conversations/{id}/messages/{messageId}",
				conversationId, messageId).header("Authorization", "Bearer " + accessToken));
	}

	/** Hides the Message from the caller's own view only. */
	public ResultActions hideMessage(String accessToken, String conversationId, String messageId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/messages/{messageId}/hide",
				conversationId, messageId).header("Authorization", "Bearer " + accessToken));
	}

	/** Sends a new message with a fresh client message id and returns the stored message. */
	public JsonNode sendNew(String accessToken, String conversationId, String body)
			throws Exception {
		var result = send(accessToken, conversationId, UUID.randomUUID().toString(), body).andReturn().getResponse();
		if (result.getStatus() != 201) {
			throw new AssertionError("Expected 201 but was " + result.getStatus() + ": " + result.getContentAsString());
		}
		return json.readTree(result.getContentAsString());
	}

	/** {@code query} is the raw query string, e.g. {@code "beforeSeq=16&limit=10"}; empty for none. */
	public ResultActions history(String accessToken, String conversationId, String query) throws Exception {
		return mvc.perform(MockMvcRequestBuilders
				.get("/api/v1/conversations/{id}/messages" + (query.isEmpty() ? "" : "?" + query), conversationId)
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Searches one Conversation; {@code before} (a result's message id) asks for the next page, or is null. */
	public ResultActions searchConversation(String accessToken, String conversationId, String q, String before)
			throws Exception {
		var request = MockMvcRequestBuilders.get("/api/v1/conversations/{id}/messages/search", conversationId)
				.param("q", q).header("Authorization", "Bearer " + accessToken);
		if (before != null) {
			request.param("before", before);
		}
		return mvc.perform(request);
	}

	/** Searches every Conversation of the caller; {@code before} (a result's message id) asks for the next page. */
	public ResultActions searchAll(String accessToken, String q, String before) throws Exception {
		var request = MockMvcRequestBuilders.get("/api/v1/messages/search").param("q", q)
				.header("Authorization", "Bearer " + accessToken);
		if (before != null) {
			request.param("before", before);
		}
		return mvc.perform(request);
	}

	public ResultActions historyWithoutToken(String conversationId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/conversations/{id}/messages", conversationId));
	}

	public ResultActions createGroup(String accessToken, String name, Object... userIds) throws Exception {
		return createGroupBody(accessToken, Map.of("name", name, "userIds", java.util.List.of(userIds)));
	}

	public ResultActions createGroupBody(String accessToken, Object body) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/groups")
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions conversation(String accessToken, String conversationId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/conversations/{id}", conversationId)
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions rename(String accessToken, String conversationId, Object name) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.patch("/api/v1/conversations/{id}", conversationId)
				.contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("name", name)))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions addParticipant(String accessToken, String conversationId, Object userId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/participants", conversationId)
				.contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(Map.of("userId", userId)))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions removeParticipant(String accessToken, String conversationId, String userId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.delete("/api/v1/conversations/{id}/participants/{userId}",
				conversationId, userId).header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions promote(String accessToken, String conversationId, String userId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/participants/{userId}/promote",
				conversationId, userId).header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions leave(String accessToken, String conversationId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/leave", conversationId)
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Reports receipt positions; pass null for a field to leave it out. */
	public ResultActions receipts(String accessToken, String conversationId, Object deliveredSeq, Object readSeq)
			throws Exception {
		var body = new LinkedHashMap<String, Object>();
		if (deliveredSeq != null) {
			body.put("deliveredSeq", deliveredSeq);
		}
		if (readSeq != null) {
			body.put("readSeq", readSeq);
		}
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/conversations/{id}/receipts", conversationId)
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions presence(String accessToken, String conversationId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/conversations/{id}/presence", conversationId)
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions registerDevice(String accessToken, Object token, Object platform) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		body.put("token", token);
		body.put("platform", platform);
		return mvc.perform(MockMvcRequestBuilders.post("/api/v1/devices").contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(body)).header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions unregisterDevice(String accessToken, String deviceId) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.delete("/api/v1/devices/{id}", deviceId).header("Authorization",
				"Bearer " + accessToken));
	}

	public ResultActions meWithoutToken() throws Exception {
		return mvc.perform(MockMvcRequestBuilders.get("/api/v1/users/me"));
	}

	/** Signs up and verifies a fresh account; returns its email. */
	public String registerVerified() throws Exception {
		var email = uniqueEmail();
		registerVerified(email, "Ada Lovelace", PASSWORD);
		return email;
	}

	public void registerVerified(String email, String displayName, String password) throws Exception {
		signUp(email, displayName, password).andReturn();
		verifyEmail(email, latestCode(email)).andReturn();
	}

	public record Tokens(String accessToken, String refreshToken) {
	}

	/** Logs in a verified account and returns the issued tokens. */
	public Tokens loginForTokens(String email, String password) throws Exception {
		return tokensFrom(login(email, password));
	}

	public Tokens tokensFrom(ResultActions result) throws Exception {
		var node = json.readTree(result.andReturn().getResponse().getContentAsString());
		return new Tokens(node.get("accessToken").asString(), refreshCookieValue(result));
	}

	/** Uploads {@code bytes} as the multipart part {@code file}; the declared type and name are whatever the caller says. */
	public ResultActions uploadImage(String accessToken, String fileName, String contentType, byte[] bytes)
			throws Exception {
		return mvc.perform(MockMvcRequestBuilders.multipart("/api/v1/attachments")
				.file(new org.springframework.mock.web.MockMultipartFile("file", fileName, contentType, bytes))
				.header("Authorization", "Bearer " + accessToken));
	}

	/** Sets the caller's avatar from {@code bytes} (multipart part {@code file}). */
	public ResultActions uploadAvatar(String accessToken, String fileName, String contentType, byte[] bytes)
			throws Exception {
		return mvc.perform(MockMvcRequestBuilders.multipart(org.springframework.http.HttpMethod.PUT, "/api/v1/users/me/avatar")
				.file(new org.springframework.mock.web.MockMultipartFile("file", fileName, contentType, bytes))
				.header("Authorization", "Bearer " + accessToken));
	}

	public ResultActions removeAvatar(String accessToken) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.delete("/api/v1/users/me/avatar").header("Authorization",
				"Bearer " + accessToken));
	}

	public ResultActions postJson(String path, Object body) throws Exception {
		return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))
				.with(request -> {
					request.setRemoteAddr(ip);
					return request;
				}));
	}

	/** The six-digit Verification code in the latest email sent to this address. */
	public String latestCode(String email) {
		var mail = emails.latestTo(email).orElseThrow(() -> new AssertionError("No email sent to " + email));
		var matcher = CODE.matcher(mail.body());
		if (!matcher.find()) {
			throw new AssertionError("No six-digit code in: " + mail.body());
		}
		return matcher.group(1);
	}

	public int emailsSentTo(String email) {
		return (int) emails.all().stream().filter(e -> e.to().equalsIgnoreCase(email)).count();
	}

}
