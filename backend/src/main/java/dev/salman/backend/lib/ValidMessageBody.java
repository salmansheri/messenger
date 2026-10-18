package dev.salman.backend.lib;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * The text of a Message: not blank, at most {@value #MAX_CHARACTERS} characters (counted as Unicode code points, the
 * same way the database check counts them, so an emoji is one character) and free of NUL, which PostgreSQL cannot
 * store in text.
 */
@Documented
@Constraint(validatedBy = ValidMessageBody.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidMessageBody {

	int MAX_CHARACTERS = 4000;

	String message() default "is not a valid message";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidMessageBody, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			if (value == null || value.isBlank()) {
				return reject(context, "must not be blank");
			}
			if (value.indexOf('\u0000') >= 0) {
				return reject(context, "must not contain NUL characters");
			}
			if (value.codePointCount(0, value.length()) > MAX_CHARACTERS) {
				return reject(context, "must be at most " + MAX_CHARACTERS + " characters");
			}
			return true;
		}

		private static boolean reject(ConstraintValidatorContext context, String reason) {
			context.disableDefaultConstraintViolation();
			context.buildConstraintViolationWithTemplate(reason).addConstraintViolation();
			return false;
		}

	}

}
