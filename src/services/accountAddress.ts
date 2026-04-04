import { blake2b } from '@noble/hashes/blake2b';

const I105_ASCII_ALPHABET: string[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z'
];
const IROHA_POEM_KANA_FULLWIDTH = [
  'イ', 'ロ', 'ハ', 'ニ', 'ホ', 'ヘ', 'ト', 'チ', 'リ', 'ヌ', 'ル', 'ヲ', 'ワ', 'カ',
  'ヨ', 'タ', 'レ', 'ソ', 'ツ', 'ネ', 'ナ', 'ラ', 'ム', 'ウ', 'ヰ', 'ノ', 'オ', 'ク',
  'ヤ', 'マ', 'ケ', 'フ', 'コ', 'エ', 'テ', 'ア', 'サ', 'キ', 'ユ', 'メ', 'ミ', 'シ',
  'ヱ', 'ヒ', 'モ', 'セ', 'ス'
] as const;
const IROHA_POEM_KANA_HALFWIDTH = [
  'ｲ', 'ﾛ', 'ﾊ', 'ﾆ', 'ﾎ', 'ﾍ', 'ﾄ', 'ﾁ', 'ﾘ', 'ﾇ', 'ﾙ', 'ｦ', 'ﾜ', 'ｶ',
  'ﾖ', 'ﾀ', 'ﾚ', 'ｿ', 'ﾂ', 'ﾈ', 'ﾅ', 'ﾗ', 'ﾑ', 'ｳ', 'ヰ', 'ﾉ', 'ｵ', 'ｸ',
  'ﾔ', 'ﾏ', 'ｹ', 'ﾌ', 'ｺ', 'ｴ', 'ﾃ', 'ｱ', 'ｻ', 'ｷ', 'ﾕ', 'ﾒ', 'ﾐ', 'ｼ',
  'ヱ', 'ﾋ', 'ﾓ', 'ｾ', 'ｽ'
] as const;
const I105_ALPHABET = [...I105_ASCII_ALPHABET, ...IROHA_POEM_KANA_FULLWIDTH];
const LEGACY_I105_BASE = I105_ASCII_ALPHABET.length;
const CANONICAL_I105_BASE = I105_ALPHABET.length;
const LEGACY_I105_DIGIT_INDEX = new Map(I105_ASCII_ALPHABET.map((symbol, index) => [symbol, index]));
const I105_KANA_HALFWIDTH_INDEX = new Map<string, number>(
  IROHA_POEM_KANA_HALFWIDTH.map((symbol, index) => [symbol, index])
);
const I105_CHECKSUM_PREFIX = new TextEncoder().encode('I105PRE');
const LEGACY_I105_CHECKSUM_LEN = 2;
const CANONICAL_I105_CHECKSUM_LEN = 6;
const BECH32M_CONST = 0x2bc830a3;
const DEFAULT_I105_DISCRIMINANT = 0x02f1;
const I105_DISCRIMINANT_MAX = 0xffff;
const I105_SENTINEL_SORA = 'sora';
const I105_SENTINEL_TEST = 'test';
const I105_SENTINEL_DEV = 'dev';
const I105_SENTINEL_NUMERIC_PREFIX = 'n';
const I105_SENTINEL_SORA_FULLWIDTH = 'ｓｏｒａ';
const I105_SENTINEL_TEST_FULLWIDTH = 'ｔｅｓｔ';
const I105_SENTINEL_DEV_FULLWIDTH = 'ｄｅｖ';
const I105_SENTINEL_NUMERIC_PREFIX_FULLWIDTH = 'ｎ';
const ED25519_CURVE_ID = 1;
const CONTROLLER_TAG_SINGLE = 0;

const concatBytes = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const hexCharCode = (value: number) => (value < 10 ? 48 + value : 87 + value);

const bytesToHex = (bytes: Uint8Array) => {
  const chars = new Uint8Array(bytes.length * 2);
  bytes.forEach((value, index) => {
    chars[index * 2] = hexCharCode(value >> 4);
    chars[index * 2 + 1] = hexCharCode(value & 0x0f);
  });
  return new TextDecoder().decode(chars);
};

const decodeBaseN = (digits: number[], base: number) => {
  if (digits.length === 0) return new Uint8Array();
  const working = digits.slice();
  let leading = 0;
  while (leading < working.length && working[leading] === 0) {
    leading += 1;
  }
  const out: number[] = [];
  let start = leading;
  while (start < working.length) {
    let remainder = 0;
    for (let index = start; index < working.length; index += 1) {
      const value = remainder * base + working[index];
      working[index] = Math.floor(value / 256);
      remainder = value % 256;
    }
    out.push(remainder);
    while (start < working.length && working[start] === 0) {
      start += 1;
    }
  }
  out.reverse();
  if (leading === 0) {
    return Uint8Array.from(out);
  }
  return Uint8Array.from([...new Array(leading).fill(0), ...out]);
};

const convertToBase32 = (bytes: Uint8Array) => {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 0x1f);
    }
  }
  if (bits > 0) {
    out.push((acc << (5 - bits)) & 0x1f);
  }
  return out;
};

const bech32Polymod = (values: number[]) => {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ff_ffff) << 5) ^ value;
    generators.forEach((generator, index) => {
      if ((top >> index) & 1) {
        checksum ^= generator;
      }
    });
  }
  return checksum;
};

const expandHrp = (hrp: string) => {
  const out: number[] = [];
  for (const character of hrp) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    out.push(codePoint >> 5);
  }
  out.push(0);
  for (const character of hrp) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    out.push(codePoint & 0x1f);
  }
  return out;
};

const i105ChecksumDigits = (canonical: Uint8Array) => {
  const values = expandHrp('snx');
  values.push(...convertToBase32(canonical));
  values.push(...Array(CANONICAL_I105_CHECKSUM_LEN).fill(0));
  const polymod = bech32Polymod(values) ^ BECH32M_CONST;
  return Array.from({ length: CANONICAL_I105_CHECKSUM_LEN }, (_, index) =>
    (polymod >> (5 * (CANONICAL_I105_CHECKSUM_LEN - 1 - index))) & 0x1f
  );
};

const decodeI105Prefix = (payload: Uint8Array) => {
  if (payload.length === 0) {
    throw new Error('I105 address payload is empty');
  }
  const first = payload[0];
  if (first <= 63) {
    return { discriminant: first, prefixLength: 1 };
  }
  if ((first & 0x40) !== 0) {
    if (payload.length < 2) {
      throw new Error('I105 address prefix is truncated');
    }
    return {
      discriminant: (payload[1] << 6) | (first & 0x3f),
      prefixLength: 2
    };
  }
  throw new Error('unsupported I105 prefix encoding');
};

const checksumBytes = (body: Uint8Array) =>
  blake2b(concatBytes(I105_CHECKSUM_PREFIX, body), { dkLen: 64 }).subarray(0, LEGACY_I105_CHECKSUM_LEN);

const decodeLegacyI105Body = (literal: string) => {
  const normalized = literal.trim();
  if (!normalized) {
    throw new Error('account id must not be empty');
  }

  const digits: number[] = [];
  for (const character of normalized) {
    const digit = LEGACY_I105_DIGIT_INDEX.get(character);
    if (digit === undefined) {
      throw new Error(`invalid character in I105 address: ${character}`);
    }
    digits.push(digit);
  }

  const payload = decodeBaseN(digits, LEGACY_I105_BASE);
  if (payload.length < 1 + LEGACY_I105_CHECKSUM_LEN) {
    throw new Error('I105 address is too short');
  }

  const splitAt = payload.length - LEGACY_I105_CHECKSUM_LEN;
  const body = payload.subarray(0, splitAt);
  const checksum = payload.subarray(splitAt);
  const expected = checksumBytes(body);
  if (!expected.every((value, index) => value === checksum[index])) {
    throw new Error('I105 checksum mismatch');
  }

  const { prefixLength } = decodeI105Prefix(body);
  return body.subarray(prefixLength);
};

const startsWithI105Sentinel = (literal: string) =>
  literal.startsWith(I105_SENTINEL_SORA) ||
  literal.startsWith(I105_SENTINEL_SORA_FULLWIDTH) ||
  literal.startsWith(I105_SENTINEL_TEST) ||
  literal.startsWith(I105_SENTINEL_TEST_FULLWIDTH) ||
  literal.startsWith(I105_SENTINEL_DEV) ||
  literal.startsWith(I105_SENTINEL_DEV_FULLWIDTH) ||
  literal.startsWith(I105_SENTINEL_NUMERIC_PREFIX) ||
  literal.startsWith(I105_SENTINEL_NUMERIC_PREFIX_FULLWIDTH);

const toAsciiDigit = (character: string) => {
  if (character >= '0' && character <= '9') {
    return character;
  }
  if (character >= '０' && character <= '９') {
    return String.fromCharCode(character.codePointAt(0)! - 0xfee0);
  }
  return null;
};

const parseI105SentinelAndPayload = (literal: string) => {
  if (literal.startsWith(I105_SENTINEL_SORA) || literal.startsWith(I105_SENTINEL_SORA_FULLWIDTH)) {
    return [DEFAULT_I105_DISCRIMINANT, literal.slice(I105_SENTINEL_SORA.length)] as const;
  }
  if (literal.startsWith(I105_SENTINEL_TEST) || literal.startsWith(I105_SENTINEL_TEST_FULLWIDTH)) {
    return [0x0171, literal.slice(I105_SENTINEL_TEST.length)] as const;
  }
  if (literal.startsWith(I105_SENTINEL_DEV) || literal.startsWith(I105_SENTINEL_DEV_FULLWIDTH)) {
    return [0x0000, literal.slice(I105_SENTINEL_DEV.length)] as const;
  }
  if (!literal.startsWith(I105_SENTINEL_NUMERIC_PREFIX) && !literal.startsWith(I105_SENTINEL_NUMERIC_PREFIX_FULLWIDTH)) {
    return null;
  }

  const tail = literal.slice(I105_SENTINEL_NUMERIC_PREFIX.length);
  let index = 0;
  let discriminantDigits = '';
  while (index < tail.length) {
    const digit = toAsciiDigit(tail[index]);
    if (digit === null) break;
    discriminantDigits += digit;
    index += 1;
  }
  if (!discriminantDigits) {
    return null;
  }
  const discriminant = Number(discriminantDigits);
  if (!Number.isInteger(discriminant) || discriminant < 0 || discriminant > I105_DISCRIMINANT_MAX) {
    throw new Error(`invalid i105 chain discriminant sentinel: ${literal}`);
  }
  return [discriminant, tail.slice(index)] as const;
};

const lookupCanonicalI105Digit = (character: string) => {
  const canonicalIndex = I105_ALPHABET.indexOf(character);
  if (canonicalIndex !== -1) {
    return canonicalIndex;
  }
  const halfwidthIndex = I105_KANA_HALFWIDTH_INDEX.get(character);
  if (halfwidthIndex !== undefined) {
    return I105_ASCII_ALPHABET.length + halfwidthIndex;
  }
  return undefined;
};

const decodeCanonicalI105Body = (literal: string) => {
  const parsed = parseI105SentinelAndPayload(literal);
  if (!parsed) {
    throw new Error('i105 address is missing the expected chain-discriminant sentinel');
  }

  const [, payload] = parsed;
  const digits: number[] = [];
  for (const character of Array.from(payload)) {
    const digit = lookupCanonicalI105Digit(character);
    if (digit === undefined) {
      throw new Error(`invalid character in i105 address: ${character}`);
    }
    digits.push(digit);
  }
  if (digits.length <= CANONICAL_I105_CHECKSUM_LEN) {
    throw new Error('i105 address too short');
  }

  const dataDigits = digits.slice(0, -CANONICAL_I105_CHECKSUM_LEN);
  const checksumDigits = digits.slice(-CANONICAL_I105_CHECKSUM_LEN);
  const canonical = decodeBaseN(dataDigits, CANONICAL_I105_BASE);
  const expected = i105ChecksumDigits(canonical);
  if (!expected.every((value, index) => value === checksumDigits[index])) {
    throw new Error('i105 checksum mismatch');
  }
  return canonical;
};

const decodeI105Body = (literal: string) => {
  const normalized = literal.trim();
  if (!normalized) {
    throw new Error('account id must not be empty');
  }
  if (startsWithI105Sentinel(normalized)) {
    return decodeCanonicalI105Body(normalized);
  }
  return decodeLegacyI105Body(normalized);
};

export const decodeSingleKeyEd25519AccountPublicKey = (accountId: string) => {
  const canonical = decodeI105Body(accountId);
  if (canonical.length < 4) {
    throw new Error('account id canonical payload is too short');
  }
  if (canonical[1] !== CONTROLLER_TAG_SINGLE) {
    throw new Error('account id does not use a single-key controller');
  }
  if (canonical[2] !== ED25519_CURVE_ID) {
    throw new Error('account id controller is not Ed25519');
  }

  const keyLength = canonical[3];
  const keyStart = 4;
  const keyEnd = keyStart + keyLength;
  if (keyEnd !== canonical.length) {
    throw new Error('account id canonical payload has trailing bytes');
  }
  if (keyLength !== 32) {
    throw new Error(`Ed25519 public keys must be 32 bytes, got ${keyLength}`);
  }

  return Uint8Array.from(canonical.subarray(keyStart, keyEnd));
};

export const resolveAuthorityPublicKeyHex = (accountId: string, overrideHex?: string | null) => {
  const normalizedOverride = (overrideHex || '').trim();
  if (normalizedOverride) {
    if (normalizedOverride.length !== 64 || /[^0-9a-f]/i.test(normalizedOverride)) {
      throw new Error('authority public key override must be 32 bytes of hex');
    }
    return normalizedOverride.toLowerCase();
  }
  return bytesToHex(decodeSingleKeyEd25519AccountPublicKey(accountId));
};
