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
 * What someone searches for: up to 100 characters (see {@link TextRules}), and at least two once the spaces around it
 * are dropped, because a single character would match nearly everything and say nothing.
 */
@Documented
@Constraint(validatedBy = ValidSearchQuery.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidSearchQuery {

	int MAX_CHARACTERS = 100;

	int MIN_CHARACTERS = 2;

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidSearchQuery, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			if (!TextRules.check(value, MAX_CHARACTERS, context)) {
				return false;
			}
			var stripped = value.strip();
			if (stripped.codePointCount(0, stripped.length()) < MIN_CHARACTERS) {
				context.disableDefaultConstraintViolation();
				context.buildConstraintViolationWithTemplate("must be at least " + MIN_CHARACTERS + " characters")
						.addConstraintViolation();
				return false;
			}
			return true;
		}

	}

}
