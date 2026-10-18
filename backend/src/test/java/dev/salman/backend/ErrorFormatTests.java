package dev.salman.backend;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import dev.salman.backend.support.IntegrationTest;
import org.springframework.beans.factory.annotation.Autowired;

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

	@Test
	void parameterValidationFailureReturnsBadRequestProblemListingTheParameter() throws Exception {
		mvc.perform(get("/api/v1/auth/_probe/page").param("page", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.errors.page").isNotEmpty());
	}

	@Test
	void constraintViolationReturnsBadRequestProblemListingTheParameter() throws Exception {
		mvc.perform(get("/api/v1/auth/_probe/validated/page").param("page", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.errors.page").isNotEmpty());
	}

	@Test
	void exceptionWithResponseStatusKeepsItsStatusAndDoesNotLeakItsMessage() throws Exception {
		mvc.perform(get("/api/v1/auth/_probe/conflict"))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(409))
				.andExpect(jsonPath("$.title").value("Conflict"))
				.andExpect(jsonPath("$.instance").value("/api/v1/auth/_probe/conflict"))
				.andExpect(content().string(not(containsString("secret conflict detail"))));
	}

	@Test
	void accessDeniedInsideAControllerReturnsForbiddenProblemForAnAuthenticatedUser() throws Exception {
		mvc.perform(get("/api/v1/auth/_probe/forbidden").with(user("ada")))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(403))
				.andExpect(jsonPath("$.title").value("Forbidden"))
				.andExpect(jsonPath("$.instance").value("/api/v1/auth/_probe/forbidden"))
				.andExpect(content().string(not(containsString("secret access detail"))));
	}

	@Test
	void accessDeniedInsideAControllerReturnsUnauthorizedProblemForAnAnonymousCaller() throws Exception {
		mvc.perform(get("/api/v1/auth/_probe/forbidden"))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(401));
	}

	@Test
	void everyNonValidationErrorCarriesTheSameFieldsWhicheverLayerProducedIt() throws Exception {
		var expected = Set.of("title", "status", "detail", "instance");

		for (var path : new String[] { "/api/v1/auth/does-not-exist", "/api/v1/users/me" }) {
			assertThat(fieldsOf(get(path))).as(path).isEqualTo(expected);
		}
		assertThat(fieldsOf(post("/api/v1/auth/_probe/boom"))).as("500").isEqualTo(expected);
		assertThat(fieldsOf(get("/api/v1/auth/_probe/forbidden").with(user("ada")))).as("403").isEqualTo(expected);
		assertThat(fieldsOf(get("/api/v1/auth/_probe/conflict"))).as("409").isEqualTo(expected);
	}

	private Set<String> fieldsOf(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
			throws Exception {
		var body = mvc.perform(request).andReturn().getResponse().getContentAsString();
		return Set.copyOf(json.readTree(body).propertyNames());
	}

}
