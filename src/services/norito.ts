const NORITO_MAGIC = 'NRT0';
const NORITO_HEADER_LENGTH = 40;

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const utf8Decoder = new TextDecoder();

const isControlCode = (codePoint: number) =>
  codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d;

const decodeTextSafely = (bytes: Uint8Array) => {
  try {
    const decoded = strictUtf8Decoder.decode(bytes);
    if (!decoded.trim()) return null;
    for (const char of decoded) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (isControlCode(codePoint)) {
        return null;
      }
    }
    return decoded;
  } catch {
    return null;
  }
};

const readU32 = (bytes: Uint8Array, offset: number, label: string) => {
  if (offset + 4 > bytes.length) {
    throw new Error(`${label} is truncated`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
};

const readU64 = (bytes: Uint8Array, offset: number, label: string) => {
  if (offset + 8 > bytes.length) {
    throw new Error(`${label} is truncated`);
  }
  const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds JS safe integer range`);
  }
  return Number(value);
};

const readField = (bytes: Uint8Array, offset: number, label: string) => {
  const length = readU64(bytes, offset, `${label}.length`);
  const start = offset + 8;
  const end = start + length;
  if (end > bytes.length) {
    throw new Error(`${label} is truncated`);
  }
  return {
    value: bytes.slice(start, end),
    nextOffset: end
  };
};

const looksLikeNoritoFrame = (bytes: Uint8Array) =>
  bytes.length >= 4 && utf8Decoder.decode(bytes.slice(0, 4)) === NORITO_MAGIC;

const decodeNoritoPayload = (bytes: Uint8Array): unknown => {
  const decodedString = decodeTextSafely(bytes);
  if (decodedString !== null) {
    return decodedString;
  }

  if (bytes.length >= 12) {
    try {
      const tag = readU32(bytes, 0, 'norito.variant.tag');
      const bodyLength = readU64(bytes, 4, 'norito.variant.length');
      if (12 + bodyLength === bytes.length) {
        return {
          tag,
          value: decodeNoritoPayload(bytes.slice(12))
        };
      }
    } catch {
      // fall through
    }
  }

  if (bytes.length >= 8) {
    try {
      const fields: unknown[] = [];
      let offset = 0;
      while (offset < bytes.length) {
        const field = readField(bytes, offset, `norito.field[${fields.length}]`);
        fields.push(decodeNoritoPayload(field.value));
        offset = field.nextOffset;
      }
      if (fields.length > 0) {
        return fields;
      }
    } catch {
      // fall through
    }
  }

  return null;
};

const collectNoritoStrings = (value: unknown, out: string[]) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      out.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNoritoStrings(entry, out));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectNoritoStrings(entry, out));
  }
};

export const decodeNoritoMessage = (bytes: Uint8Array) => {
  if (!looksLikeNoritoFrame(bytes) || bytes.length < NORITO_HEADER_LENGTH) {
    return null;
  }

  const payloadLength = readU64(bytes, 23, 'norito.header.payload_length');
  if (NORITO_HEADER_LENGTH + payloadLength > bytes.length) {
    throw new Error('norito payload is truncated');
  }

  const payload = bytes.slice(NORITO_HEADER_LENGTH, NORITO_HEADER_LENGTH + payloadLength);
  const decoded = decodeNoritoPayload(payload);
  const strings: string[] = [];
  collectNoritoStrings(decoded, strings);

  const unique = [...new Set(strings)];
  if (!unique.length) {
    return null;
  }

  return unique.sort((left, right) => right.length - left.length)[0];
};

export const readResponseMessage = async (response: Response) => {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return `Unable to read response body: ${String(error)}`;
  }

  if (bytes.length === 0) {
    return response.statusText || 'request failed';
  }

  const noritoMessage = decodeNoritoMessage(bytes);
  if (noritoMessage) {
    return noritoMessage;
  }

  const text = decodeTextSafely(bytes);
  if (text) {
    return text;
  }

  return `${response.statusText || 'response body'} (${bytes.length} bytes)`;
};
