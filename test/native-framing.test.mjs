import test from "node:test";
import assert from "node:assert/strict";
import { NativeMessageDecoder, encodeNativeMessage } from "../src/native-framing.mjs";

test("native framing round trips fragmented messages", () => {
  const decoder = new NativeMessageDecoder();
  const first = encodeNativeMessage({ a: 1 });
  const encoded = Buffer.concat([first, encodeNativeMessage({ b: "two" })]);
  assert.deepEqual(decoder.push(encoded.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(encoded.subarray(3, first.length)), [{ a: 1 }]);
  assert.deepEqual(decoder.push(encoded.subarray(first.length)), [{ b: "two" }]);
});

test("native framing rejects oversized messages", () => {
  const decoder = new NativeMessageDecoder({ maxBytes: 2 });
  assert.throws(() => decoder.push(encodeNativeMessage({ value: 1 })), /exceeds/);
});
