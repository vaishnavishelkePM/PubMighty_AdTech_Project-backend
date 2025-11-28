import toRegExp from "../to-regexp";

/**
 * Checks if a string value matches a specified pattern.
 *
 * This function tests whether the provided string value matches the given pattern.
 * The pattern can be either a RegExp object, a string that can be converted to a RegExp,
 * or a plain string for direct comparison or inclusion check.
 *
 * @param {string} value - The string value to be tested against the pattern.
 * @param {RegExp|string} pattern - The pattern to match against. Can be:
 *   - A RegExp object
 *   - A string that can be converted to a RegExp (e.g., "/pattern/flags")
 *   - A plain string for direct matching
 * @param {boolean} [included=false] - Flag to determine matching strategy when pattern is a string:
 *   - If true, checks if the value contains the pattern string
 *   - If false, checks if the value strictly equals the pattern string
 *
 * @returns {boolean} Returns true if the value matches the pattern according to the specified rules,
 *                    otherwise returns false.
 *
 * @example
 * // RegExp pattern matching
 * isPatternMatched("hello world", /hello/); // true
 *
 * // String pattern with strict equality
 * isPatternMatched("test", "test"); // true
 * isPatternMatched("test", "testing"); // false
 *
 * // String pattern with inclusion check
 * isPatternMatched("hello world", "world", true); // true
 *
 * // RegExp string pattern
 * isPatternMatched("123", "/\\d+/"); // true
 */
export function isPatternMatched(value, pattern, included) {
  const regexp = toRegExp(pattern);
  const result = regexp ? regexp.test(value) : included ? value.includes(pattern) : value === pattern;
  return result;
}
