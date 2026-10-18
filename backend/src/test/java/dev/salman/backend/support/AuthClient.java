package dev.salman.backend.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import tools.jackson.databind.json.JsonMapper;

/** Drives the public auth endpoints and reads Verification codes from the recorded emails. */
public class AuthClient {

	public static final String PASSWORD = "correct-horse-battery";

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
