package dev.salman.backend.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.Map;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

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
