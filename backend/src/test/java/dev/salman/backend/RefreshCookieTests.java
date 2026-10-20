package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

/** The refresh token travels only in an HttpOnly cookie; the body never carries it. */
class RefreshCookieTests extends IntegrationTest {

	private static final String ALLOWED_ORIGIN = "http://localhost:3000";
	private static final String OTHER_ORIGIN = "https://evil.example";

	private AuthClient client;
	private String email;

	private AuthClient.Tokens signedIn() throws Exception {
		client = auth();
		email = client.registerVerified();
		return client.loginForTokens(email, AuthClient.PASSWORD);
	}

	@Test
	void signingInSetsAnHttpOnlyStrictSecureCookieScopedToTheAuthPathAndKeepsTheTokenOutOfTheBody() throws Exception {
		var client = auth();
		var email = client.registerVerified();

		var result = client.login(email, AuthClient.PASSWORD).andExpect(status().isOk())
				.andExpect(jsonPath("$.refreshToken").doesNotExist());

		var cookie = AuthClient.refreshSetCookie(result);
		assertThat(cookie).isNotNull().contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth",
				"Max-Age=2592000");
		assertThat(result.andReturn().getResponse().getContentAsString())
				.doesNotContain(AuthClient.refreshCookieValue(result));
	}

	@Test
	void refreshingRotatesTheCookieAndKeepsItsAttributes() throws Exception {
		var first = signedIn();

		var result = client.refresh(first.refreshToken()).andExpect(status().isOk())
				.andExpect(jsonPath("$.refreshToken").doesNotExist());

		assertThat(AuthClient.refreshCookieValue(result)).isNotEqualTo(first.refreshToken());
		assertThat(AuthClient.refreshSetCookie(result)).contains("HttpOnly", "Secure", "SameSite=Strict",
				"Path=/api/v1/auth", "Max-Age=2592000");
	}

	@Test
	void aFailedRefreshClearsTheCookie() throws Exception {
		var client = auth();

		var unknown = client.refresh("not-a-real-token").andExpect(status().isUnauthorized());
		var missing = client.refreshWithoutCookie().andExpect(status().isUnauthorized());

		assertThat(AuthClient.refreshSetCookie(unknown)).contains("Max-Age=0", "Path=/api/v1/auth");
		assertThat(AuthClient.refreshSetCookie(missing)).contains("Max-Age=0");
	}

	@Test
	void loggingOutClearsTheCookieWhetherOrNotOneWasSent() throws Exception {
		var tokens = signedIn();

		var withCookie = client.logout(tokens.refreshToken()).andExpect(status().isNoContent());
		var withoutCookie = client.logoutWithoutCookie().andExpect(status().isNoContent());

		assertThat(AuthClient.refreshSetCookie(withCookie)).contains("Max-Age=0", "HttpOnly", "Path=/api/v1/auth");
		assertThat(AuthClient.refreshSetCookie(withoutCookie)).contains("Max-Age=0");
	}

	@Test
	void aCrossOriginRequestFromAnUnlistedSiteIsRejectedAndDoesNotConsumeTheToken() throws Exception {
		var tokens = signedIn();

		client.refreshFromOrigin(tokens.refreshToken(), OTHER_ORIGIN).andExpect(status().isForbidden());

		client.refreshFromOrigin(tokens.refreshToken(), ALLOWED_ORIGIN).andExpect(status().isOk());
	}

	@Test
	void requestsWithoutAnOriginHeaderLikeMobileAppsAndToolsAreAccepted() throws Exception {
		var tokens = signedIn();

		client.refresh(tokens.refreshToken()).andExpect(status().isOk());
	}

	@Test
	void theListedFrontendMayCallWithCredentialsAfterAPreflight() throws Exception {
		mvc.perform(options("/api/v1/auth/refresh").header("Origin", ALLOWED_ORIGIN)
				.header("Access-Control-Request-Method", "POST"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
				.andExpect(header().string("Access-Control-Allow-Credentials", "true"));

		mvc.perform(options("/api/v1/auth/refresh").header("Origin", OTHER_ORIGIN)
				.header("Access-Control-Request-Method", "POST"))
				.andExpect(status().isForbidden());
	}

	@Test
	void actualResponsesToTheListedFrontendAllowCredentials() throws Exception {
		var client = auth();
		var email = client.registerVerified();

		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/login")
				.header("Origin", ALLOWED_ORIGIN).contentType("application/json")
				.content("{\"email\":\"" + email + "\",\"password\":\"" + AuthClient.PASSWORD + "\"}"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
				.andExpect(header().string("Access-Control-Allow-Credentials", "true"));
	}

	@Test
	void aBrowserFromTheListedFrontendMayReadRetryAfterOnARateLimitedResponse() throws Exception {
		var email = AuthClient.uniqueEmail();
		for (int send = 0; send < 5; send++) {
			mvc.perform(post("/api/v1/auth/resend-verification").header("Origin", ALLOWED_ORIGIN)
					.contentType("application/json").content("{\"email\":\"" + email + "\"}"))
					.andExpect(status().isNoContent());
		}

		mvc.perform(post("/api/v1/auth/resend-verification").header("Origin", ALLOWED_ORIGIN)
				.contentType("application/json").content("{\"email\":\"" + email + "\"}"))
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(header().string("Access-Control-Expose-Headers", org.hamcrest.Matchers.containsString("Retry-After")));
	}

	@Test
	void theListedFrontendMayUseEveryMethodTheApiHasAfterAPreflight() throws Exception {
		for (var method : new String[] { "GET", "POST", "PUT", "PATCH", "DELETE" }) {
			mvc.perform(options("/api/v1/conversations/00000000-0000-0000-0000-000000000000")
					.header("Origin", ALLOWED_ORIGIN).header("Access-Control-Request-Method", method)
					.header("Access-Control-Request-Headers", "authorization,content-type"))
					.andExpect(status().isOk())
					.andExpect(header().string("Access-Control-Allow-Methods",
							org.hamcrest.Matchers.containsString(method)));
		}
	}

}
