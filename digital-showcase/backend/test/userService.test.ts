import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone } from "../src/services/userService.js";

test("номер телефона приводится к одному виду в любом привычном формате", () => {
  const expected = "79280123456";
  for (const value of ["+79280123456", "89280123456", "8 (928) 012-34-56", "+7 928 012 34 56", "9280123456"]) {
    assert.equal(normalizePhone(value), expected, value);
  }
});

test("короткие и нерусские номера не подгоняются под 7…", () => {
  assert.equal(normalizePhone("12345"), "12345");
  assert.equal(normalizePhone("+380501234567"), "380501234567");
});
