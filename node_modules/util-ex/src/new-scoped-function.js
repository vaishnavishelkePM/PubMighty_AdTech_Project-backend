import isFunctionStr from './is/string/function.js';
import isString from './is/type/string.js';
import { _createFunction as createFunc } from './_create-function.js';

/**
 * Creates an executable function with dynamic scope binding
 *
 * Unlike statically scoped functions, this rebinds scope variables on every execution,
 * allowing runtime updates to the execution environment. The function achieves this
 * through closure-delayed scope binding, regenerating the target function on each call.
 *
 * @example
 * // Basic usage
 * const scopedFunc = newScopedFunction(
 *   'add',
 *   ['x'],
 *   'return x + y',
 *   { y: 10 } // Initial scope
 * );
 * scopedFunc(5); // Returns 15
 *
 * // Dynamic scope update
 * const scope = { y: 20 };
 * const updatableFunc = newScopedFunction('add', ['x'], 'return x + y', scope);
 * updatableFunc(5); // Returns 25
 * scope.y = 100;
 * updatableFunc(5); // Returns 105
 *
 * @param {string} name - Function name (for debugging and stack traces)
 * @param {string[]} argNames - Formal parameter names (array format)
 * @param {string} body - Function body code (as JavaScript string)
 * @param {Object} scope - Execution scope object (key-value pairs)
 *
 * @returns {Function} Executable function that:
 *   - Accepts arguments defined in `argNames`
 *   - Regenerates the function using current `scope` on each call
 *   - Returns the execution result
 *
 * @see {@link newFunction} Underlying static-scope function generator
 *
 * @warning Performance note: Rebuilds function object on every call -
 *          avoid in high-frequency scenarios
 * @note Scope dynamism: Always uses latest `scope` reference (pass-by-reference)
 *
 * @since 1.0.0
 */
export function newScopedFunction(name, argNames, body, scope) {
  const params = normalizeFuncParams(name, argNames, body, scope)
  let funcName = params.name
  if (funcName === undefined) {
    const func = createFunc(params.body, params.scope);
    funcName = func.name;
  }
  params.createFunc = createFunc;
  const func = funcName ?
    createFunc(`function ${funcName}(...args) {return createFunc(body, scope)(...args);}`, params)
    : function(...args) {
      const func = createFunc(body, scope);
      return func(...args);
    }
  ;
  return func;
}

function normalizeFuncParams(name, argNames, body, scope) {
  if (!isFunctionStr(name)) {
    let async = '';
    const vNameType = typeof name;
    if (vNameType === 'string') {
      if (name.startsWith('async ')) {
        name = name.substring(6);
        async = 'async '
      }
    } else if (vNameType === 'object') {
      scope = name;
      name = '';
    } else {
      name = '';
    }
    if (isString(argNames)) {
      scope = argNames;
      body = argNames;
      argNames = [];
    } else if (!Array.isArray(argNames)) {
      argNames = [];
    }
    if (!body) {body = ''}
    body = `${async}function ${name}(${argNames.join(', ')}) {\n${body}\n}`;
  } else {
    body = name;
    name = undefined;
  }
  return {name, body, scope}
}

function getFuncName(name, argNames, body, scope) {
  const params = normalizeFuncParams(name, argNames, body, scope)
  if (params.name === undefined) {
    const func = createFunc(params.body, params.scope);
    params.name = func.name;
  }
  return params.name;
}

function newFunc(name, argNames, body, scope) {
  const params = normalizeFuncParams(name, argNames, body, scope)
  const func = createFunc(params.body, params.scope);

  return func
}
