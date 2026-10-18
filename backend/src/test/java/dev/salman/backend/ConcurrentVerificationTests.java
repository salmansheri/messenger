package dev.salman.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;

import dev.salman.backend.support.AuthClient;
import dev.salman.backend.support.IntegrationTest;

/** Guarantees that must hold when verification attempts and resends overlap. */
class ConcurrentVerificationTests extends IntegrationTest {

	private static List<Integer> runTogether(List<Callable<Integer>> tasks) throws Exception {
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			var futures = tasks.stream().map(executor::submit).toList();
			var results = new ArrayList<Integer>();
			for (var future : futures) {
				results.add(future.get());
			}
			return results;
		}
	}

	private static String otherThan(String code) {
		return code.equals("000000") ? "111111" : "000000";
	}

	@Test
	void whenManyRequestsSubmitTheCorrectCodeTogetherExactlyOneSucceeds() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		var code = client.latestCode(email);

		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 8; i++) {
			tasks.add(() -> client.verifyEmail(email, code).andReturn().getResponse().getStatus());
		}

		var statuses = runTogether(tasks);

		assertThat(statuses).containsOnlyOnce(204);
		assertThat(statuses.stream().filter(s -> s == 400).count()).isEqualTo(7);
	}

	@Test
	void theAttemptLimitHoldsWhenWrongGuessesArriveTogether() throws Exception {
		var client = auth();
		var email = AuthClient.uniqueEmail();
		client.signUp(email).andExpect(status().isAccepted());
		var code = client.latestCode(email);
		var wrong = otherThan(code);

		var tasks = new ArrayList<Callable<Integer>>();
		for (int i = 0; i < 20; i++) {
			tasks.add(() -> client.verifyEmail(email, wrong).andReturn().getResponse().getStatus());
		}
		assertThat(runTogether(tasks)).containsOnly(400);

		client.verifyEmail(email, code).andExpect(status().isBadRequest());
	}

	@Test
	void aResendRacingAVerificationLeavesExactlyOneUsableOutcome() throws Exception {
		for (int round = 0; round < 15; round++) {
			var client = auth();
			var email = AuthClient.uniqueEmail();
			client.signUp(email).andExpect(status().isAccepted());
			var first = client.latestCode(email);

			var results = runTogether(List.of(
					() -> client.verifyEmail(email, first).andReturn().getResponse().getStatus(),
					() -> client.resendVerification(email).andReturn().getResponse().getStatus()));

			assertThat(results.get(1)).as("resend").isEqualTo(204);
			if (results.get(0) == 204) {
				// The old code won the race: the account is active and a further resend sends nothing.
				var sent = client.emailsSentTo(email);
				client.resendVerification(email).andExpect(status().isNoContent());
				assertThat(client.emailsSentTo(email)).isEqualTo(sent);
			}
			else {
				// The resend won: the old code is dead and the new one must still work.
				assertThat(results.get(0)).as("verify").isEqualTo(400);
				client.verifyEmail(email, client.latestCode(email)).andExpect(status().isNoContent());
			}
		}
	}

}
