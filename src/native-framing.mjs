export class NativeMessageDecoder {
  constructor({ maxBytes = 64 * 1024 * 1024 } = {}) {
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxBytes) throw new Error(`Native message exceeds ${this.maxBytes} bytes`);
      if (this.buffer.length < length + 4) break;
      const payload = this.buffer.subarray(4, length + 4).toString("utf8");
      this.buffer = this.buffer.subarray(length + 4);
      messages.push(JSON.parse(payload));
    }
    return messages;
  }
}

export function encodeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}
