(() => {
  'use strict';

  class CalculationError extends Error {
    constructor(message, incomplete = false) {
      super(message);
      this.incomplete = incomplete;
    }
  }

  const namePattern = /^[\p{L}_][\p{L}\p{N}_ ]*$/u;

  function tokenize(source, variables = new Map()) {
    const tokens = [];
    let index = 0;
    const names = [...variables.keys()].sort((a, b) => b.length - a.length);
    while (index < source.length) {
      if (/\s/.test(source[index])) { index += 1; continue; }
      const rest = source.slice(index);
      const number = rest.match(/^(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+|\d+)(?:\.\d+)?(?:[km])?/i);
      if (number) {
        const raw = number[0];
        const boundary = rest[raw.length];
        if (boundary && /[\p{L}\p{N}_.]/u.test(boundary)) throw new CalculationError('Invalid number');
        let normalized = raw.replace(/[ ,]/g, '');
        const suffix = normalized.match(/[km]$/i)?.[0].toLowerCase();
        if (suffix) normalized = normalized.slice(0, -1);
        let value = Number(normalized) * (suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : 1);
        if (!Number.isFinite(value)) throw new CalculationError('Number is too large');
        tokens.push({ type: 'number', value });
        index += raw.length;
        continue;
      }
      const lowerRest = rest.toLocaleLowerCase();
      const variable = names.find((name) => lowerRest.startsWith(name)
        && !/[\p{L}\p{N}_]/u.test(rest[name.length] || ''));
      if (variable) {
        tokens.push({ type: 'number', value: variables.get(variable), variable });
        index += variable.length;
        continue;
      }
      if (/^[+\-*/^()%]/.test(rest)) {
        tokens.push({ type: rest[0] === '(' || rest[0] === ')' ? rest[0] : 'operator', value: rest[0] });
        index += 1;
        continue;
      }
      if (/^x(?=\s|\d|\()/i.test(rest)) { tokens.push({ type: 'operator', value: '*' }); index += 1; continue; }
      if (/^of\b/i.test(rest)) { tokens.push({ type: 'operator', value: 'of' }); index += 2; continue; }
      const word = rest.match(/^[\p{L}_][\p{L}\p{N}_ ]*/u)?.[0]?.trim();
      throw new CalculationError(`Unknown variable “${word || rest[0]}”`);
    }
    return tokens;
  }

  function evaluateExpression(source, variables = new Map()) {
    let normalizedSource = source.trim();
    const descriptive = normalizedSource.match(/^[\p{L}_][\p{L}\p{N}_ ]*\s+(\d[\d ,.]*[km]?)(\s*[+\-]\s*[\p{L}_][\p{L}\p{N}_ ]*\s+\d[\d ,.]*[km]?)+$/iu);
    if (descriptive) normalizedSource = normalizedSource.replace(/[\p{L}_][\p{L}\p{N}_ ]*\s+(?=\d)/gu, '');
    const tokens = tokenize(normalizedSource, variables);
    if (!tokens.length) throw new CalculationError('Incomplete expression', true);
    let position = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];
    function primary() {
      const token = take();
      if (!token) throw new CalculationError('Incomplete expression', true);
      if (token.type === 'number') return { value: token.value, percent: false };
      if (token.type === '(') {
        const value = addition();
        if (take()?.type !== ')') throw new CalculationError('Missing closing parenthesis', true);
        return value;
      }
      throw new CalculationError('Unexpected operator');
    }
    function postfix() {
      const result = primary();
      if (peek()?.value === '%') { take(); return { value: result.value / 100, percent: true }; }
      return result;
    }
    function unary() {
      if (peek()?.value === '+' || peek()?.value === '-') {
        const sign = take().value;
        const result = unary();
        return { value: sign === '-' ? -result.value : result.value, percent: result.percent };
      }
      return postfix();
    }
    function power() {
      const left = unary();
      if (peek()?.value === '^') { take(); return { value: left.value ** power().value, percent: false }; }
      return left;
    }
    function multiplication() {
      let left = power();
      while (['*', '/', 'of'].includes(peek()?.value)) {
        const operator = take().value;
        const right = power();
        if (operator === '/' && right.value === 0) throw new CalculationError('Division by zero');
        left = { value: operator === '/' ? left.value / right.value : left.value * right.value, percent: false };
      }
      return left;
    }
    function addition() {
      let left = multiplication();
      while (peek()?.value === '+' || peek()?.value === '-') {
        const operator = take().value;
        const right = multiplication();
        const amount = right.percent ? left.value * right.value : right.value;
        left = { value: operator === '+' ? left.value + amount : left.value - amount, percent: false };
      }
      return left;
    }
    const result = addition();
    if (position < tokens.length) throw new CalculationError(tokens[position].type === ')' ? 'Unexpected closing parenthesis' : 'Unexpected operator');
    if (!Number.isFinite(result.value) || Math.abs(result.value) > 1e308) throw new CalculationError('Result is too large');
    return Object.is(result.value, -0) ? 0 : result.value;
  }

  function stripComment(line) {
    for (let index = 0; index < line.length - 1; index += 1) {
      if (line.slice(index, index + 2) === '//' && !/:$/.test(line.slice(0, index).trim())) return line.slice(0, index).trimEnd();
    }
    return line.trimEnd();
  }

  function formatResult(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Number.parseFloat(value.toPrecision(10));
    return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 10, useGrouping: true }).format(Object.is(rounded, -0) ? 0 : rounded);
  }

  function literal(value) {
    return String(Number.parseFloat(value.toPrecision(15))).replace(/e\+/, 'e');
  }

  function evaluateBlock(inputLines) {
    const lines = Array.isArray(inputLines) ? inputLines.map((line) => String(line ?? '')) : [''];
    const variables = new Map();
    const results = [];
    const eligible = [];
    let sectionStart = 0;
    lines.forEach((authored, index) => {
      const source = stripComment(authored).trim();
      let kind = 'expression';
      let expression = source;
      let name = '';
      if (!source) { results.push({ kind: 'empty', authored }); return; }
      if (/^#(?:\s|$)/.test(source)) { sectionStart = eligible.length; results.push({ kind: 'section', authored, label: source.slice(1).trim() }); return; }
      const aggregate = source.match(/^(subtotal|total|sum)$/i)?.[1]?.toLowerCase();
      if (aggregate) {
        const values = aggregate === 'subtotal' ? eligible.slice(sectionStart) : eligible;
        const value = values.reduce((sum, row) => sum + row.value, 0);
        const hasErrors = results.some((row, rowIndex) => rowIndex < index && row.error && (aggregate !== 'subtotal' || row.eligibleIndex >= sectionStart));
        results.push({ kind: aggregate === 'subtotal' ? 'subtotal' : 'total', authored, value, formatted: formatResult(value), literal: literal(value), warning: hasErrors ? 'Some rows contain errors' : '' });
        return;
      }
      const assignmentAt = source.indexOf('=');
      const colonAt = source.indexOf(':');
      if (assignmentAt >= 0) {
        name = source.slice(0, assignmentAt).trim();
        expression = source.slice(assignmentAt + 1).trim();
        kind = 'assignment';
        if (!namePattern.test(name) || /^\d/.test(name)) { results.push({ kind, authored, error: 'Invalid variable name' }); return; }
      } else if (colonAt > 0 && namePattern.test(source.slice(0, colonAt).trim())) {
        name = source.slice(0, colonAt).trim(); expression = source.slice(colonAt + 1).trim(); kind = 'labeled';
      }
      try {
        const value = evaluateExpression(expression, variables);
        const result = { kind, authored, label: name, value, formatted: formatResult(value), literal: literal(value) };
        if (kind === 'assignment') variables.set(name.toLocaleLowerCase(), value);
        else { result.eligibleIndex = eligible.length; eligible.push(result); }
        results.push(result);
      } catch (error) {
        results.push({ kind, authored, label: name, error: error instanceof CalculationError ? error.message : 'Invalid expression', incomplete: Boolean(error.incomplete), eligibleIndex: eligible.length });
      }
    });
    return results;
  }

  const api = Object.freeze({ CalculationError, tokenize, evaluateExpression, evaluateBlock, formatResult, literal, stripComment });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NoteCalculator = api;
})();
