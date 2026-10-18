package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

class RefreshAndLogoutTests extends IntegrationTest {

	private AuthClient client;
	private String email;

	private AuthClient.Tokens signedIn() throws Exception {
		client = auth();
		email = client.registerVerified();
		return client.loginForTokens(email, AuthClient.PASSWORD);
	}

	@Test
	void refreshingIssuesANewWorkingPairAndRetiresTheOldRefreshToken() throws Exception {
		var first = signedIn();

		var second = client.tokensFrom(client.refresh(first.refreshToken()).andExpect(status().isOk())
				.andExpect(jsonPath("$.tokenType").value("Bearer")).andExpect(jsonPath("$.expiresIn").value(900)));

		assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
		client.me(second.accessToken()).andExpect(status().isOk());
		client.refresh(second.refreshToken()).andExpect(status().isOk());
	}

	@Test
	void presentingAnAlreadyUsedRefreshTokenRevokesTheWholeFamily() throws Exception {
		var first = signedIn();
		var second = client.tokensFrom(client.refresh(first.refreshToken()));

		client.refresh(first.refreshToken())
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));

		client.refresh(second.refreshToken()).andExpect(status().isUnauthorized());
	}

	@Test
	void reuseDetectionDoesNotTouchOtherSessionsOfTheSameUser() throws Exception {
		var phone = signedIn();
		var laptop = client.loginForTokens(email, AuthClient.PASSWORD);
		client.refresh(phone.refreshToken()).andExpect(status().isOk());
		client.refresh(phone.refreshToken()).andExpect(status().isUnauthorized());

		client.refresh(laptop.refreshToken()).andExpect(status().isOk());
	}

	@Test
	void anUnknownOrGarbageRefreshTokenIsRefused() throws Exception {
		var client = auth();

		client.refresh("not-a-real-token").andExpect(status().isUnauthorized());
		client.refresh("A".repeat(43)).andExpect(status().isUnauthorized());
	}

	@Test
	void aRefreshTokenExpiresAfterThirtyDaysButEachRotationStartsAFreshWindow() throws Exception {
		var first = signedIn();

		clock.advance(Duration.ofDays(29));
		var second = client.tokensFrom(client.refresh(first.refreshToken()).andExpect(status().isOk()));

		clock.advance(Duration.ofDays(29));
		var third = client.tokensFrom(client.refresh(second.refreshToken()).andExpect(status().isOk()));

		clock.advance(Duration.ofDays(31));
		client.refresh(third.refreshToken()).andExpect(status().isUnauthorized());
	}

	@Test
	void whenManyRequestsPresentTheSameRefreshTokenTogetherExactlyOneSucceeds() throws Exception {
		var first = signedIn();

		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 6; i++) {
			tasks.add(() -> client.refresh(first.refreshToken()).andReturn().getResponse().getStatus());
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

			assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
			assertThat(statuses.stream().filter(s -> s == 401).count()).isEqualTo(5);
		}
	}

	@Test
	void loggingOutInvalidatesTheRefreshToken() throws Exception {
		var tokens = signedIn();

		client.logout(tokens.refreshToken()).andExpect(status().isNoContent());

		client.refresh(tokens.refreshToken()).andExpect(status().isUnauthorized());
	}

	@Test
	void loggingOutEndsTheWholeSessionEvenAfterTheTokenWasRotated() throws Exception {
		var first = signedIn();
		var second = client.tokensFrom(client.refresh(first.refreshToken()));

		client.logout(second.refreshToken()).andExpect(status().isNoContent());

		client.refresh(second.refreshToken()).andExpect(status().isUnauthorized());
	}

	@Test
	void loggingOutOneSessionLeavesTheOthersWorking() throws Exception {
		var phone = signedIn();
		var laptop = client.loginForTokens(email, AuthClient.PASSWORD);

		client.logout(phone.refreshToken()).andExpect(status().isNoContent());

		client.refresh(laptop.refreshToken()).andExpect(status().isOk());
	}

	@Test
	void loggingOutIsIdempotentAndNeverRevealsWhetherATokenExisted() throws Exception {
		var tokens = signedIn();

		client.logout(tokens.refreshToken()).andExpect(status().isNoContent());
		client.logout(tokens.refreshToken()).andExpect(status().isNoContent());
		client.logout("never-issued").andExpect(status().isNoContent());
	}

	@Test
	void aMissingRefreshCookieIsRefusedOnRefreshAndIgnoredOnLogout() throws Exception {
		var client = auth();

		client.refreshWithoutCookie().andExpect(status().isUnauthorized());
		client.logoutWithoutCookie().andExpect(status().isNoContent());
	}

}
