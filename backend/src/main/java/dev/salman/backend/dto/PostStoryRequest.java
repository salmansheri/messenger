package dev.salman.backend.dto;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.UUID;

import dev.salman.backend.entity.StoryKind;
import dev.salman.backend.entity.StoryTone;
import dev.salman.backend.lib.ValidStoryText;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import jakarta.validation.constraints.NotNull;

/**
 * A text Story ({@code text} on a {@code tone}) or a photo Story ({@code attachmentId}, an upload the poster has not
 * used yet, with {@code text} as an optional caption). What each kind needs is checked by {@link KindMatchesContent}.
 */
@PostStoryRequest.KindMatchesContent
public record PostStoryRequest(@NotNull StoryKind kind, @ValidStoryText String text, StoryTone tone,
		UUID attachmentId) {

	/** A text Story has text and a tone and no upload; a photo Story has an upload and no tone. Errors name the field. */
	@Documented
	@Constraint(validatedBy = KindMatchesContent.Validator.class)
	@Target(ElementType.TYPE)
	@Retention(RetentionPolicy.RUNTIME)
	public @interface KindMatchesContent {

		String message() default "does not match its kind";

		Class<?>[] groups() default {};

		Class<? extends Payload>[] payload() default {};

		class Validator implements ConstraintValidator<KindMatchesContent, PostStoryRequest> {

			@Override
			public boolean isValid(PostStoryRequest request, ConstraintValidatorContext context) {
				if (request == null || request.kind() == null) {
					return true; // @NotNull on kind reports it
				}
				context.disableDefaultConstraintViolation();
				var valid = true;
				if (request.kind() == StoryKind.TEXT) {
					valid &= check(request.text() != null, "text", "must not be blank", context);
					valid &= check(request.tone() != null, "tone", "must not be null", context);
					valid &= check(request.attachmentId() == null, "attachmentId",
							"must be left out for a text Story", context);
				}
				else {
					valid &= check(request.attachmentId() != null, "attachmentId", "must not be null", context);
					valid &= check(request.tone() == null, "tone", "must be left out for a photo Story", context);
				}
				return valid;
			}

			private static boolean check(boolean holds, String field, String message,
					ConstraintValidatorContext context) {
				if (!holds) {
					context.buildConstraintViolationWithTemplate(message).addPropertyNode(field).addConstraintViolation();
				}
				return holds;
			}

		}

	}

}
