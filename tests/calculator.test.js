'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const calculator = require('../calculator.js');

test('restricted parser evaluates arithmetic, compact numbers and percentages', () => {
  const examples = new Map([
    ['2 + 3 * 4', 14], ['(2 + 3) * 4', 20], ['2 ^ 3', 8], ['-10 + 4', -6],
    ['10 x 5', 50], ['1.5k + 500', 2000], ['2M / 4', 500000],
    ['200 + 10%', 220], ['200 - 10%', 180], ['10% of 200', 20],
    ['200 * 10%', 20], ['200 / 10%', 2000], ['Tickets 500 + taxi 70', 570]
  ]);
  for (const [expression, expected] of examples) assert.equal(calculator.evaluateExpression(expression), expected, expression);
});

test('variables are source ordered, case-insensitive and support longest multiword names', () => {
  const results = calculator.evaluateBlock([
    'Hotel = 180 * 4', 'hotel + 100', 'Price per night = 180', 'Nights = 4',
    'price per night * nights'
  ]);
  assert.deepEqual(results.map((row) => row.value), [720, 820, 180, 4, 720]);
  assert.equal(results[0].kind, 'assignment');
});

test('errors are local, readable and do not stop later rows', () => {
  const results = calculator.evaluateBlock(['1 / 0', '2 +', 'unknown name + 2', '3 + 4']);
  assert.equal(results[0].error, 'Division by zero');
  assert.match(results[1].error, /Incomplete/);
  assert.match(results[2].error, /Unknown variable/);
  assert.equal(results[3].value, 7);
});

test('section subtotals and whole-block totals exclude assignments and aggregates', () => {
  const results = calculator.evaluateBlock([
    '# Transport', 'Flight: 1,200', 'Train: 100', 'subtotal', '', '# Hotel',
    'Night: 180 * 4', 'Discount = 10%', 'Cleaning: 40', 'subtotal', 'total'
  ]);
  assert.equal(results[3].value, 1300);
  assert.equal(results[9].value, 760);
  assert.equal(results[10].value, 2060);
});

test('formatter hides floating-point artifacts and insertion literals remain parseable', () => {
  assert.equal(calculator.formatResult(calculator.evaluateExpression('0.1 + 0.2')), '0.3');
  assert.equal(calculator.literal(2000), '2000');
  assert.equal(calculator.evaluateExpression(calculator.literal(1 / 3)), 0.333333333333333);
});

test('European and international formats parse and display deterministically', () => {
  assert.equal(calculator.evaluateExpression('1,5 + 2', new Map(), 'european'), 3.5);
  assert.equal(calculator.evaluateExpression('1.5 + 2', new Map(), 'european'), 3.5);
  assert.equal(calculator.formatResult(1502, 'european'), '1.502');
  assert.equal(calculator.evaluateExpression('1,500 + 2', new Map(), 'international'), 1502);
  assert.equal(calculator.evaluateExpression('1,5 + 2', new Map(), 'international'), 3.5);
  assert.equal(calculator.formatResult(1502, 'international'), '1,502');
});

test('ambiguous and mixed separators follow the stored format', () => {
  assert.equal(calculator.parseNumericLiteral('1,234', 'european'), 1.234);
  assert.equal(calculator.parseNumericLiteral('1,234', 'international'), 1234);
  assert.equal(calculator.parseNumericLiteral('1.234', 'european'), 1234);
  assert.equal(calculator.parseNumericLiteral('1.234', 'international'), 1.234);
  assert.equal(calculator.parseNumericLiteral('0.125', 'european'), 0.125);
  assert.equal(calculator.parseNumericLiteral('0,125', 'international'), 0.125);
  assert.equal(calculator.parseNumericLiteral('1.234,56', 'european'), 1234.56);
  assert.equal(calculator.parseNumericLiteral('1,234.56', 'international'), 1234.56);
});

test('malformed numeric punctuation is rejected', () => {
  for (const value of ['12,34,56', '1..5', '1,2.3,4']) {
    assert.throws(() => calculator.parseNumericLiteral(value, 'european'), /Invalid number/);
  }
});
