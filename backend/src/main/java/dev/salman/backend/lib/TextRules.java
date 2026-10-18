package dev.salman.backend.lib;

import jakarta.validation.ConstraintValidatorContext;

/**
 * The rules free text must pass before it reaches the database: not blank, at most {@code max} characters counted as
 * Unicode code points (the way PostgreSQL counts them, so an emoji is one character) and free of NUL, which
 * PostgreSQL cannot store in text.
 */
final class TextRules {

	private TextRules() {
	}

	static boolean check(String value, int max, ConstraintValidatorContext context) {
		if (value == null || value.isBlank()) {
			return reject(context, "must not be blank");
		}
		if (value.indexOf('\u0000') >= 0) {
			return reject(context, "must not contain NUL characters");
		}
		if (value.codePointCount(0, value.length()) > max) {
			return reject(context, "must be at most " + max + " characters");
		}
		return true;
	}

	private static boolean reject(ConstraintValidatorContext context, String reason) {
		context.disableDefaultConstraintViolation();
		context.buildConstraintViolationWithTemplate(reason).addConstraintViolation();
		return false;
	}

}
