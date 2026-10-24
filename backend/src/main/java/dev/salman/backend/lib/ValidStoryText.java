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

/** The text of a Story (up to 700 characters). See {@link TextRules}. */
@Documented
@Constraint(validatedBy = ValidStoryText.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidStoryText {

	int MAX_CHARACTERS = 700;

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidStoryText, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return TextRules.check(value, MAX_CHARACTERS, context);
		}

	}

}
