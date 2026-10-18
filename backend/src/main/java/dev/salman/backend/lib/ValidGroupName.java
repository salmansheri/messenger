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

/** The name of a Group (up to 100 characters). See {@link TextRules}. */
@Documented
@Constraint(validatedBy = ValidGroupName.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidGroupName {

	int MAX_CHARACTERS = 100;

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidGroupName, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return TextRules.check(value, MAX_CHARACTERS, context);
		}

	}

}
