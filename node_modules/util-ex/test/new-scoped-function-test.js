import { expect } from 'chai';
import { newScopedFunction } from '../src/new-scoped-function.js';

describe('newScopedFunction', () => {
  // Basic functionality test
  it('should create an executable function with initial scope', () => {
    const scope = { base: 10 };
    const add = newScopedFunction(
      'add',
      ['x'],
      'return x + base',
      scope
    );

    expect(add(5)).to.equal(15);
  });

  // Dynamic scope update test
  it('should reflect real-time scope updates', () => {
    const scope = { multiplier: 3 };
    const multiply = newScopedFunction(
      'multiply',
      ['num'],
      'return num * multiplier',
      scope
    );

    expect(multiply(4)).to.equal(12);

    scope.multiplier = 5;
    expect(multiply(4)).to.equal(20);
  });

  // Multiple parameters handling
  it('should handle multiple parameters correctly', () => {
    const scope = { prefix: '>>' };
    const concat = newScopedFunction(
      'concat',
      ['a', 'b'],
      'return prefix + a + b',
      scope
    );

    expect(concat('foo', 'bar')).to.equal('>>foobar');
    scope.prefix = '<<';
    expect(concat('foo', 'bar')).to.equal('<<foobar');
  });

  // Reference passing behavior
  it('should maintain reference to the scope object', () => {
    const dynamicScope = { value: 100 };
    const getValue = newScopedFunction(
      'getValue',
      [],
      'return value',
      dynamicScope
    );

    const externalRef = dynamicScope;
    externalRef.value = 200;

    expect(getValue()).to.equal(200);
  });

  // Error handling test
  it('should throw error when accessing non-existent variable', () => {
    const faultyFunc = newScopedFunction(
      'faulty',
      [],
      'return missingVar',
      {}
    );

    expect(faultyFunc).to.throw(ReferenceError, 'missingVar');
  });

  // Function recreation behavior
  it('should recreate function on each call', () => {
    let creationCount = 0;
    const tracker = {
      get func() {
        creationCount++;
        return function() { return 42; };
      }
    };

    const spy = newScopedFunction(
      'spy',
      [],
      'return 42',
      tracker
    );

    spy();
    spy();

    expect(creationCount).to.equal(2);
  });

  // Function name assignment
  it('should set the correct function name', () => {
    const namedFunc = newScopedFunction(
      'customName',
      [],
      'return 0',
      {}
    );

    console.log('🚀 ~ file: new-scoped-function-test.js:110 ~ namedFunc:', namedFunc)
    expect(namedFunc.name).to.equal('customName');
  });
});