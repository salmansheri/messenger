package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assumptions.assumeThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class PasswordResetTests extends IntegrationTest {

	private static final String NEW_PASSWORD = "a-brand-new-password";

	private AuthClient client;
	private String email;

	private void verifiedUser() throws Exception {
		client = auth();
		email = client.registerVerified();
	}

	private static String otherThan(String code) {
		return code.equals("000000") ? "111111" : "000000";
	}

	@Test
	void forgettingYourPasswordEmailsACodeThatSetsANewOne() throws Exception {
		verifiedUser();

		client.forgotPassword(email).andExpect(status().isNoContent());
		assertThat(emails.latestTo(email).orElseThrow().subject()).containsIgnoringCase("reset");
		client.resetPassword(email, client.latestCode(email), NEW_PASSWORD).andExpect(status().isNoContent());

		client.login(email, NEW_PASSWORD).andExpect(status().isOk());
		client.login(email, AuthClient.PASSWORD).andExpect(status().isUnauthorized());
	}

	@Test
	void knownAndUnknownEmailsGetTheSameResponseButOnlyKnownOnesGetAnEmail() throws Exception {
		verifiedUser();
		var unknown = AuthClient.uniqueEmail();

		var known = client.forgotPassword(email).andExpect(status().isNoContent()).andReturn().getResponse();
		var missing = client.forgotPassword(unknown).andExpect(status().isNoContent()).andReturn().getResponse();

		assertThat(known.getContentAsString()).isEqualTo(missing.getContentAsString());
		assertThat(client.emailsSentTo(unknown)).isZero();
		assertThat(client.emailsSentTo(email)).isGreaterThan(1); // sign-up code + reset code
	}

	@Test
	void anAccountThatNeverVerifiedItsEmailGetsNoResetEmail() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		var before = client.emailsSentTo(email);

		client.forgotPassword(email).andExpect(status().isNoContent());

		assertThat(client.emailsSentTo(email)).isEqualTo(before);
	}

	@Test
	void resettingSignsTheUserOutEverywhere() throws Exception {
		verifiedUser();
		var phone = client.loginForTokens(email, AuthClient.PASSWORD);
		var laptop = client.loginForTokens(email, AuthClient.PASSWORD);
		client.forgotPassword(email).andExpect(status().isNoContent());

		client.resetPassword(email, client.latestCode(email), NEW_PASSWORD).andExpect(status().isNoContent());

		client.refresh(phone.refreshToken()).andExpect(status().isUnauthorized());
		client.refresh(laptop.refreshToken()).andExpect(status().isUnauthorized());
	}

	@Test
	void aWrongCodeIsRefusedAndLeavesThePasswordAlone() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var code = client.latestCode(email);

		client.resetPassword(email, otherThan(code), NEW_PASSWORD)
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));

		client.login(email, AuthClient.PASSWORD).andExpect(status().isOk());
		client.resetPassword(email, code, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void afterFiveWrongAttemptsEvenTheCorrectCodeIsRefused() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var code = client.latestCode(email);

		for (int attempt = 1; attempt <= 5; attempt++) {
			client.resetPassword(email, otherThan(code), NEW_PASSWORD).andExpect(status().isBadRequest());
		}

		client.resetPassword(email, code, NEW_PASSWORD).andExpect(status().isBadRequest());
		client.login(email, AuthClient.PASSWORD).andExpect(status().isOk());
	}

	@Test
	void anExpiredCodeIsRefused() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var code = client.latestCode(email);

		Thread.sleep(4_500);

		client.resetPassword(email, code, NEW_PASSWORD).andExpect(status().isBadRequest());
	}

	@Test
	void aCodeWorksOnlyOnce() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var code = client.latestCode(email);
		client.resetPassword(email, code, NEW_PASSWORD).andExpect(status().isNoContent());

		client.resetPassword(email, code, "yet-another-password").andExpect(status().isBadRequest());

		client.login(email, NEW_PASSWORD).andExpect(status().isOk());
	}

	@Test
	void requestingAgainInvalidatesThePreviousCode() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var first = client.latestCode(email);
		client.forgotPassword(email).andExpect(status().isNoContent());
		var second = client.latestCode(email);

		assumeThat(second).as("two random codes happened to be equal").isNotEqualTo(first);
		client.resetPassword(email, first, NEW_PASSWORD).andExpect(status().isBadRequest());
		client.resetPassword(email, second, NEW_PASSWORD).andExpect(status().isNoContent());
	}

	@Test
	void resettingForAnUnknownEmailLooksLikeAWrongCode() throws Exception {
		auth().resetPassword(AuthClient.uniqueEmail(), "123456", NEW_PASSWORD).andExpect(status().isBadRequest());
	}

	@Test
	void whenManyRequestsUseTheSameCodeTogetherExactlyOneSucceeds() throws Exception {
		verifiedUser();
		client.forgotPassword(email).andExpect(status().isNoContent());
		var code = client.latestCode(email);

		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 6; i++) {
			tasks.add(() -> client.resetPassword(email, code, NEW_PASSWORD).andReturn().getResponse().getStatus());
		}
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			var statuses = tasks.stream().map(executor::submit).map(f -> {
				try {
					return f.get();
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			}).toList();

			assertThat(statuses.stream().filter(s -> s == 204).count()).isEqualTo(1);
			assertThat(statuses.stream().filter(s -> s == 400).count()).isEqualTo(5);
		}
	}

	@Test
	void resetSendsShareTheSameHourlyLimitsAsSignUpAndResend() throws Exception {
		verifiedUser(); // 1 send for the verification code
		for (int i = 1; i <= 4; i++) {
			client.forgotPassword(email).andExpect(status().isNoContent());
		}

		client.forgotPassword(email)
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"));
	}

	@Test
	void unknownEmailsAreLimitedExactlyLikeKnownOnes() throws Exception {
		var client = auth();
		var unknown = AuthClient.uniqueEmail();
		for (int i = 1; i <= 5; i++) {
			client.forgotPassword(unknown).andExpect(status().isNoContent());
		}

		client.forgotPassword(unknown).andExpect(status().isTooManyRequests());
	}

	@Test
	void aCallerIsLimitedToTwentySendsAnHourAcrossResets() throws Exception {
		var client = auth();
		for (int i = 1; i <= 20; i++) {
			client.forgotPassword(AuthClient.uniqueEmail()).andExpect(status().isNoContent());
		}

		client.forgotPassword(AuthClient.uniqueEmail()).andExpect(status().isTooManyRequests());
	}

	@Test
	void invalidInputIsRejectedWithFieldErrors() throws Exception {
		var client = auth();

		client.forgotPassword("nope").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.email").isNotEmpty());
		client.resetPassword(AuthClient.uniqueEmail(), "12345", NEW_PASSWORD).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.code").isNotEmpty());
		client.resetPassword(AuthClient.uniqueEmail(), "123456", "short").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.newPassword").isNotEmpty());
		client.resetPassword(AuthClient.uniqueEmail(), "123456", "é".repeat(40)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.newPassword").isNotEmpty());
	}

	@Test
	void aMailServerFailureDoesNotChangeTheResponseSoItCannotRevealWhichEmailsExist() throws Exception {
		verifiedUser();
		emails.failFor(email);

		client.forgotPassword(email).andExpect(status().isNoContent());
		client.forgotPassword(AuthClient.uniqueEmail()).andExpect(status().isNoContent());
	}

	@Test
	void aResetRacingSignInsLeavesNoLiveSession() throws Exception {
		for (int round = 0; round < 8; round++) {
			verifiedUser();
			client.forgotPassword(email).andExpect(status().isNoContent());
			var code = client.latestCode(email);

			var tasks = new ArrayList<Callable<String>>();
			tasks.add(() -> {
				client.resetPassword(email, code, NEW_PASSWORD).andReturn();
				return null;
			});
			for (int i = 0; i < 4; i++) {
				tasks.add(() -> {
					var login = client.login(email, AuthClient.PASSWORD);
					return login.andReturn().getResponse().getStatus() == 200 ? AuthClient.refreshCookieValue(login) : null;
				});
			}

			// Whichever order the database picks, a sign-in that succeeded with the old password happened
			// before the reset, so the reset must have ended its session.
			for (var refreshToken : runAll(tasks)) {
				if (refreshToken != null) {
					client.refresh(refreshToken).andExpect(status().isUnauthorized());
				}
			}
			client.login(email, NEW_PASSWORD).andExpect(status().isOk());
		}
	}

	@Test
	void aResetRacingRefreshesLeavesNoLiveSession() throws Exception {
		for (int round = 0; round < 8; round++) {
			verifiedUser();
			var session = client.loginForTokens(email, AuthClient.PASSWORD);
			client.forgotPassword(email).andExpect(status().isNoContent());
			var code = client.latestCode(email);

			var tasks = new ArrayList<Callable<String>>();
			tasks.add(() -> {
				client.resetPassword(email, code, NEW_PASSWORD).andReturn();
				return null;
			});
			for (int i = 0; i < 3; i++) {
				tasks.add(() -> {
					var refreshed = client.refresh(session.refreshToken());
					return refreshed.andReturn().getResponse().getStatus() == 200 ? AuthClient.refreshCookieValue(refreshed) : null;
				});
			}

			for (var refreshToken : runAll(tasks)) {
				if (refreshToken != null) {
					client.refresh(refreshToken).andExpect(status().isUnauthorized());
				}
			}
		}
	}

	private static java.util.List<String> runAll(java.util.List<Callable<String>> tasks) throws Exception {
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			var futures = tasks.stream().map(executor::submit).toList();
			var results = new ArrayList<String>();
			for (var future : futures) {
				results.add(future.get());
			}
			return results;
		}
	}

}
