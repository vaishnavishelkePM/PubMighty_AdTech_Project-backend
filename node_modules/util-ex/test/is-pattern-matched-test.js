import chai from "chai";
var assert = chai.assert;

import { isPatternMatched } from '../src/is/matched.js';

describe('is/matched', function () {
  describe('RegExp pattern matching', function () {
    it('should match string with RegExp object', function () {
      assert.ok(isPatternMatched("hello world", /hello/));
      assert.ok(isPatternMatched("test123", /\d+/));
      assert.notOk(isPatternMatched("test", /\d+/));
    });

    it('should match string with RegExp string pattern', function () {
      assert.ok(isPatternMatched("123", "/\\d+/"));
      assert.ok(isPatternMatched("test", "/test/"));
      assert.notOk(isPatternMatched("testing", "/^test$/"));
    });
  });

  describe('String pattern matching', function () {
    it('should perform strict equality match when included is false or undefined', function () {
      assert.ok(isPatternMatched("test", "test"));
      assert.notOk(isPatternMatched("test", "testing"));
      assert.notOk(isPatternMatched("testing", "test"));
    });

    it('should perform inclusion match when included is true', function () {
      assert.ok(isPatternMatched("hello world", "world", true));
      assert.ok(isPatternMatched("hello world", "hello", true));
      assert.notOk(isPatternMatched("hello world", "test", true));
    });
  });

  describe('Edge cases', function () {
    it('should handle empty strings', function () {
      assert.ok(isPatternMatched("", ""));
      assert.ok(isPatternMatched("test", "", true));
      assert.notOk(isPatternMatched("test", ""));
      assert.notOk(isPatternMatched("", "test"));
    });

    it('should handle special characters', function () {
      assert.ok(isPatternMatched("hello*world", "hello*world"));
      assert.ok(isPatternMatched("hello*world", "*", true));
      assert.ok(isPatternMatched("hello.world", /\./));
    });

    it('should handle strings that are not valid RegExp patterns', function () {
      // Strings not wrapped with '/' are treated as regular strings
      assert.ok(isPatternMatched("[invalid regex", "[invalid regex"));
      assert.notOk(isPatternMatched("different", "[invalid regex"));
      assert.ok(isPatternMatched("contains [invalid regex text", "[invalid regex", true));
      assert.notOk(isPatternMatched("contains different text", "[invalid regex", false));
    });

    it('should handle edge cases for RegExp-like strings', function () {
      assert.ok(isPatternMatched("/", "/")); // Too short to be considered RegExp
      assert.ok(isPatternMatched("//", "//")); // Only 2 chars, not considered RegExp
      assert.notOk(isPatternMatched("test", "//")); // Matches as string
    });

    it('should properly handle actual RegExp strings', function () {
      assert.ok(isPatternMatched("test", "/.*/")); // Valid RegExp string
      assert.ok(isPatternMatched("123", "/\\d+/")); // Valid RegExp string with digits
      assert.notOk(isPatternMatched("abc", "/\\d+/")); // No digit match
    });
  });
});