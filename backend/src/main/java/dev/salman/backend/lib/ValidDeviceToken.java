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

/** A push provider's device token (up to 4096 characters). See {@link TextRules}. */
@Documented
@Constraint(validatedBy = ValidDeviceToken.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidDeviceToken {

	int MAX_CHARACTERS = 4096;

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidDeviceToken, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return TextRules.check(value, MAX_CHARACTERS, context);
		}

	}

}
