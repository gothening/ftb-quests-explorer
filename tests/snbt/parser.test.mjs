import test from "node:test";
import assert from "node:assert/strict";
import {
  isBoolean,
  isCompound,
  isList,
  isNumber,
  isString,
  isTypedArray,
  parseSnbt,
  semanticEquals,
  serializeSnbt
} from "../../src/core/parser/snbt.js";

test("parses basic compound values", () => {
  const ast = parseSnbt("{ a: 1, b: \"x\", c: true, d: [1, 2] }");
  assert.equal(isCompound(ast), true);
  assert.equal(ast.get("a").kind, "int");
  assert.equal(ast.get("b").value, "x");
  assert.equal(ast.get("c").value, true);
  assert.equal(isList(ast.get("d")), true);
});

test("preserves numeric kinds and suffixes", () => {
  const ast = parseSnbt("[1b, 2s, 3, 4L, 1.5f, 2.5d]");
  assert.equal(isList(ast), true);
  assert.deepEqual(
    ast.values.map((value) => [value.kind, value.suffix, value.raw]),
    [
      ["byte", "b", "1b"],
      ["short", "s", "2s"],
      ["int", "", "3"],
      ["long", "l", "4L"],
      ["float", "f", "1.5f"],
      ["double", "d", "2.5d"]
    ]
  );
  assert.equal(isNumber(ast.values[0]), true);
});

test("parses byte, int, and long typed arrays without treating them as lists", () => {
  const ast = parseSnbt("{ b: [B; 1b, 2b], i: [I; 1, 2], l: [L; 1L, 2L] }");
  assert.equal(isTypedArray(ast.get("b")), true);
  assert.equal(isTypedArray(ast.get("i")), true);
  assert.equal(isTypedArray(ast.get("l")), true);
  assert.equal(ast.get("b").elementType, "B");
  assert.equal(ast.get("i").elementType, "I");
  assert.equal(ast.get("l").elementType, "L");
});

test("decodes unicode escapes and escaped strings", () => {
  const ast = parseSnbt("\"\\u4e2d\\u6587\"");
  assert.equal(isString(ast), true);
  assert.equal(ast.value, "中文");

  const escaped = parseSnbt("\"quote: \\\"x\\\" tab:\\t backslash:\\\\\"");
  assert.equal(escaped.value, "quote: \"x\" tab:\t backslash:\\");
});

test("supports nested lists, compounds, and line comments", () => {
  const ast = parseSnbt(`
    {
      # comment
      "future.key": {
        values: [
          { id: "minecraft:stone", count: 1 }
          { id: "minecraft:diamond", count: 2 }
        ]
      }
    }
  `);
  assert.equal(isCompound(ast.get("future.key")), true);
  assert.equal(isList(ast.get("future.key").get("values")), true);
  assert.equal(ast.get("future.key").get("values").values.length, 2);
});

test("semantic comparison allows formatting and key-order changes", () => {
  const left = parseSnbt("{ a: 1L, b: { x: 1, y: 2 } }");
  const right = parseSnbt("{ b: { y: 2, x: 1 }, a: 1l }");
  assert.equal(semanticEquals(left, right), true);
});

test("parse -> serialize -> parse is semantically stable", () => {
  const source = `
    {
      id: "ABC"
      number: 1.0E-7f
      array: [I; 1, 2, 3]
      text: "\\u4e2d\\u6587"
      unknown: { keep: true, nested: [B; 1b, 0b] }
    }
  `;
  const first = parseSnbt(source);
  const second = parseSnbt(serializeSnbt(first));
  assert.equal(semanticEquals(first, second), true);
  assert.equal(isBoolean(first.get("unknown").get("keep")), true);
});
