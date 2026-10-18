package dev.salman.backend.lib;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A new password: 8 to 72 characters and at most 72 bytes in UTF-8 (all BCrypt reads). */
@Documented
@Constraint(validatedBy = {})
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@NotBlank
@Size(min = 8, max = 72)
@MaxUtf8Bytes(72)
public @interface ValidPassword {

	String message() default "must be 8 to 72 characters";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
