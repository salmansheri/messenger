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

/** The caption of an image: like {@link ValidMessageBody}, but may be absent (not blank when given). */
@Documented
@Constraint(validatedBy = ValidCaption.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidCaption {

	String message() default "is not valid";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidCaption, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || TextRules.check(value, ValidMessageBody.MAX_CHARACTERS, context);
		}

	}

}
