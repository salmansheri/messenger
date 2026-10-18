package dev.salman.backend;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.IntegrationTest;

class ErrorFormatTests extends IntegrationTest {

	@Test
	void unknownPublicPathReturnsNotFoundAsProblem() throws Exception {
		mvc.perform(get("/api/v1/auth/does-not-exist"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.type").doesNotExist())
				.andExpect(jsonPath("$.status").value(404))
				.andExpect(jsonPath("$.title").value("Not Found"))
				.andExpect(jsonPath("$.instance").value("/api/v1/auth/does-not-exist"));
	}

	@Test
	void protectedPathWithoutCredentialsReturnsUnauthorizedAsProblem() throws Exception {
		mvc.perform(get("/api/v1/users/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.type").doesNotExist())
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.title").value("Unauthorized"))
				.andExpect(jsonPath("$.instance").value("/api/v1/users/me"));
	}

	@Test
	void unauthorizedProblemStaysValidJsonWhenThePathContainsAQuote() throws Exception {
		mvc.perform(get("/api/v1/users/me").with(request -> {
			request.setRequestURI("/api/v1/users/\"quoted");
			return request;
		}))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.instance").value("/api/v1/users/\"quoted"));
	}

	@Test
	void unexpectedFailureReturnsInternalServerErrorProblemWithoutLeakingDetails() throws Exception {
		mvc.perform(post("/api/v1/auth/_probe/boom"))
				.andExpect(status().isInternalServerError())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.type").doesNotExist())
				.andExpect(jsonPath("$.status").value(500))
				.andExpect(jsonPath("$.title").value("Internal Server Error"))
				.andExpect(jsonPath("$.instance").value("/api/v1/auth/_probe/boom"))
				.andExpect(content().string(not(containsString("secret internal detail"))));
	}

	@Test
	void validationFailureReturnsBadRequestProblemListingEachInvalidField() throws Exception {
		mvc.perform(post("/api/v1/auth/_probe/validate").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"\",\"password\":\"short\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.title").value("Bad Request"))
				.andExpect(jsonPath("$.instance").value("/api/v1/auth/_probe/validate"))
				.andExpect(jsonPath("$.errors.email").isNotEmpty())
				.andExpect(jsonPath("$.errors.password").isNotEmpty());
	}

	@Test
	void malformedJsonReturnsBadRequestProblem() throws Exception {
		mvc.perform(post("/api/v1/auth/_probe/validate").contentType(MediaType.APPLICATION_JSON).content("{not json"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400));
	}

}
