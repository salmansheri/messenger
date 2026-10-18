package dev.salman.backend.lib;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** A Verification code as emailed: exactly six digits. */
@Documented
@Constraint(validatedBy = {})
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@NotNull
@Pattern(regexp = "\\d{6}", message = "must be a 6-digit code")
public @interface ValidVerificationCode {

	String message() default "must be a 6-digit code";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
