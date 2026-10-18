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

/** The display name of a User (up to 100 characters). See {@link TextRules}. */
@Documented
@Constraint(validatedBy = ValidDisplayName.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidDisplayName {

	int MAX_CHARACTERS = 100;

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidDisplayName, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return TextRules.check(value, MAX_CHARACTERS, context);
		}

	}

}
