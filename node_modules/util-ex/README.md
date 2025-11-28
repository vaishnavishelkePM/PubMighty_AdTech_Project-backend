### util-ex [![npm](https://img.shields.io/npm/v/util-ex.svg)](https://npmjs.org/package/util-ex) [![downloads](https://img.shields.io/npm/dm/util-ex.svg)](https://npmjs.org/package/util-ex) [![license](https://img.shields.io/npm/l/util-ex.svg)](https://npmjs.org/package/util-ex)

Enhanced JavaScript utilities for both Node.js and browser environments.

This package modifies and enhances the standard `util` from node.js

## Features

- **Universal Compatibility**: Works seamlessly in both Node.js and browser environments
- **Extended Type Checking**: Comprehensive type detection utilities (isPlainObject, isAsync, etc.)
- **Function Manipulation**: Advanced function wrapping, injection, and dynamic creation
- **Object Utilities**: Property cloning, definition, and inspection tools
- **Lightweight**: Minimal dependencies and optimized for performance

## Installation

```bash
npm install util-ex
```

## Quick Start

```js
import { isPlainObject, isAsync, inject, newFunction } from 'util-ex'

// Type checking
console.log(isPlainObject({})) // true
console.log(isPlainObject([])) // false

// Async function detection
async function myAsyncFunc() {}
console.log(isAsync(myAsyncFunc)) // true

// Function injection
const originalFunc = (a, b) => a + b
const beforeFunc = (a, b) => console.log(`Adding ${a} + ${b}`)
const afterFunc = (result) => {
  console.log(`Result: ${result}`)
  return result * 2
}
const wrappedFunc = inject(originalFunc, beforeFunc, afterFunc)
console.log(wrappedFunc(2, 3)) // Logs: Adding 2 + 3, Result: 5, Returns: 10

// Dynamic function creation
const adder = newFunction('adder', ['a', 'b'], 'return a + b')
console.log(adder(2, 3)) // 5
```

# API

Full API Documents is here: [Docs](./docs/modules.md)

## inject

▸ **inject**(`aOrgFunc`, `aBeforeExec`, `aAfterExec`): `Function`

Wraps a function and executes code before and/or after the wrapped function.

**`Throws`**

If aAfterExec is not a function and an error occurs while executing the wrapped function.

**`Example`**

```js
import { inject as injectFunc } from 'util-ex'

// Wrapping a function with injectFunc
const originalFunc = (a, b) => a + b;
const beforeFunc = (a, b) => console.log(`Before execution: a = ${a}, b = ${b}`);
const afterFunc = (result) => console.log(`After execution: result = ${result}`);
const wrappedFunc = injectFunc(originalFunc, beforeFunc, afterFunc);
const result = wrappedFunc(1, 2); // Logs "Before execution: a = 1, b = 2" and "After execution: result = 3"
```

**`Example`**

```js
// Wrapping a function with injectFunc and modifying arguments and return value
const Arguments = injectFunc.Arguments
const originalFunc = (a, b) => a + b;
const beforeFunc = (a, b) => {
  console.log(`Before execution: a = ${a}, b = ${b}`);
  return new Arguments([a * 2, b * 3]);
};
const afterFunc = (result, isDenied) => {
  console.log(`After execution: result = ${result}, isDenied = ${isDenied}`);
  return result * 2;
};
const wrappedFunc = injectFunc(originalFunc, beforeFunc, afterFunc);
const result = wrappedFunc(1, 2); // Logs "Before execution: a = 1, b = 2", "After execution: result = 6, isDenied = false"
console.log(result); // Output: 12
```

**`Example`**

```js
// Wrapping a function with injectFunc and not executing the original function
const originalFunc = (a, b) => a + b;
const beforeFunc = (a, b) => {
  console.log(`Before execution: a = ${a}, b = ${b}`);
  return "Not executing original function";
};
const afterFunc = (result, isDenied) => {
  console.log(`After execution: result = ${result}, isDenied = ${isDenied}`);
  return "Modified return value";
};
const wrappedFunc = injectFunc(originalFunc, beforeFunc, afterFunc);
const result = wrappedFunc(1, 2); // Logs "Before execution: a = 1, b = 2", "After execution: result = Modified return value, isDenied = true"
console.log(result); // Output: "Modified return value"
```

**`Example`**

```js
// Wrapping a function with injectFunc and getting the original function's error
const originalFunc = () => {
  throw new Error("Original function error");
};
const beforeFunc = () => {
  console.log("Before execution");
};
const afterFunc = (result, isDenied) => {
  console.log(`After execution: result = ${result}, isDenied = ${isDenied}`);
};
const wrappedFunc = injectFunc(originalFunc, beforeFunc, afterFunc);
wrappedFunc(); // Logs "Before execution", "After execution: result = [Error: Original function error], isDenied = false"
```

### inject Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `aOrgFunc` | `Function` | The function to be wrapped. |
| `aBeforeExec` | `Function` | A function to be executed before the wrapped function `aOrgFunc`. |
| `aAfterExec` | `Function` | A function to be executed after the wrapped function `aOrgFunc`. |

### inject Returns

`Function`

A new function that wraps the original function.

BeforeExec:
If `aBeforeExec` is a function, it will be called with the same context and arguments as the wrapped function.

- If it returns an `Arguments` object, the wrapped function will be called with the modified arguments.
- If it returns a value other than `undefined`, the wrapped function will not be called and this value will be returned as result instead.

AfterExec:
If `aAfterExec` is a function, it will be called with the same context, arguments with additional the result of the `aOrgFunc` and isDenied flag.

- If the `aOrgFunc` throws an error, the `result` parameter will be an `Error` object.
- If `aAfterExec` returns a value, it will be used as the final result of the wrapped function.
- If `isDenied` parameter is true, it means `aOrgFunc` was not called during execution of the wrapped function.

## injectMethod

▸ **injectMethod**(`aObject`, `aMethodName`, `aNewMethod`): `boolean`

Injects method into an object. optionally preserving access to the original method via "`super`" and original instance via "`self`".

**Note**:

* In the new method, you can use `this.super()` to call the original method, `this.super()` is already bound with original instance.
* The `this[aMethodName]` is also the original method, but not bound yet.
* `this.self` is the original instance!

**`Example`**

```ts
import { injectMethod } from 'util-ex'

var obj = {
  method1: function() {
    console.log('Hello');
  }
};

var newMethod = function() {
  this.super();
  console.log('World');
};

injectMethod(obj, 'method1', newMethod);

obj.method1(); // Output: Hello\nWorld
```

### injectMethod Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `aObject` | `any` | the target object to inject |
| `aMethodName` | `string` | the target method to inject |
| `aNewMethod` | `Function` | the new method to be injected into the aObject. |

### injectMethod Returns

`boolean`

whether the injection is successful.

## newFunction

    newFunction(name, arguments, body[, scope[, values]])
    newFunction(functionString[, scope[, values]])

Creates a new function with the given name, arguments, body, scope and values.

* If only one argument is provided and it is a function, returns a new function with the same code.
* If only one argument is provided and it is not a function, returns a new empty function with the given name.
* If multiple arguments are provided, creates a new function with the given name, arguments and body.

```js
import { newFunction } from 'util-ex'

var fn = newFunction('yourFuncName', ['arg1', 'arg2'], 'return log(arg1+arg2);', {log:console.log})
newFunction('function yourFuncName(){}')
newFunction('function yourFuncName(arg1, arg2){return log(arg1+arg2);}', {log:console.log})
newFunction('function yourFuncName(arg1, arg2){return log(arg1+arg2);}', ['log'], [console.log])

//fn.toString() is :
/*
 "function yourFuncName(arg1, arg2) {
    return log(arg1+arg2);
 }"
*/
```

## newScopedFunction

▸ **newScopedFunction**(`name`, `argNames`, `body`, `scope`): `Function`

Creates an executable function with dynamic scope binding.

Unlike statically scoped functions, this rebinds scope variables on every execution, allowing runtime updates to the execution environment. The function achieves this through closure-delayed scope binding, regenerating the target function on each call.

**`Example`**

```js
import { newScopedFunction } from 'util-ex'
// Basic usage
const scopedFunc = newScopedFunction(
  'add',
  ['x'],
  'return x + y',
  { y: 10 } // Initial scope
);
scopedFunc(5); // Returns 15

// Dynamic scope update
const scope = { y: 20 };
const updatableFunc = newScopedFunction('add', ['x'], 'return x + y', scope);
updatableFunc(5); // Returns 25
scope.y = 100;
updatableFunc(5); // Returns 105
```

### newScopedFunction Parameters

| Name | Type | Description |
| --- | --- | --- |
| `name` | `string` | Function name (for debugging and stack traces) |
| `argNames` | `string[]` | Formal parameter names (array format) |
| `body` | `string` | Function body code (as JavaScript string) |
| `scope` | `Object` | Execution scope object (key-value pairs) |

### newScopedFunction Returns

`Function`

Executable function that:

* Accepts arguments defined in `argNames`
* Regenerates the function using current `scope` on each call
* Returns the execution result

## isAsync

▸ **isAsync**(`value`): `boolean`

Checks if a given value is an asynchronous function or a Promise.

**Example**

```js
import { isAsync } from 'util-ex'

async function myAsyncFunc() {}
isAsync(myAsyncFunc) // true
isAsync(Promise.resolve()) // true
isAsync(() => {}) // false
```

## isPatternMatched

▸ **isPatternMatched**(`value`, `pattern`, `included`?): `boolean`

Checks if a string value matches a specified pattern.

This function tests whether the provided string value matches the given pattern. The pattern can be either a RegExp object, a string that can be converted to a RegExp, or a plain string for direct comparison or inclusion check.

```js
import { isPatternMatched } from 'util-ex'

// RegExp pattern matching
isPatternMatched("hello world", /hello/); // true

// String pattern with strict equality
isPatternMatched("test", "test"); // true
isPatternMatched("test", "testing"); // false

// String pattern with inclusion check
isPatternMatched("hello world", "world", true); // true

// RegExp string pattern
isPatternMatched("123", "/\\d+/"); // true
```

### isPatternMatched Parameters

| Name | Type | Description |
| --- | --- | --- |
| `value` | `string` | The string value to be tested against the pattern |
| `pattern` | `RegExp \| string` | The pattern to match against |
| `included?` | `boolean` | Flag to determine matching strategy when pattern is a string |

### isPatternMatched Returns

`boolean`

True if the value matches the pattern according to the specified rules, otherwise false.

## defineProperty

    defineProperty(object, key, value[, aOptions])

Define a property on the object. move to [inherits-ex](https://github.com/snowyu/inherits-ex.js) package.


### usage

```js
const defineProperty = require('util-ex/lib/defineProperty')

let propValue = ''
const obj = {}

defineProperty(obj, 'prop', 'simpleValue')
defineProperty(obj, 'prop', undefined, {
  get() {return propValue}
  set(value) {propValue = value}
})
```
