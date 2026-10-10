// Minimal QR code encoder (ISO/IEC 18004), so the share link can be shown as
// a QR code without a new dependency. Pure and deterministic.
//
// Scope: byte mode (UTF-8), error correction level M (~15% damage tolerance),
// versions 1-10 (up to 213 bytes, plenty for a share URL). The algorithm
// follows the public standard; the structure is the same as Project Nayuki's
// well-known reference implementation.

export interface QrCode {
  /** Modules per side (21 for version 1, +4 per version). */
  size: number;
  version: number;
  mask: number;
  /** modules[y][x]: true = dark. */
  modules: boolean[][];
}

const MAX_VERSION = 10;
// Level M tables, indexed by version (index 0 unused).
const ECC_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_ECC_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ECL_FORMAT_BITS_M = 0;

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/** Data + ECC module count for a version, excluding function patterns. */
function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver: number): number {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ver] * NUM_ECC_BLOCKS[ver];
}

function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// --- Reed-Solomon over GF(2^8), primitive polynomial 0x11D ---

function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= rsMultiply(coef, factor);
    });
  }
  return result;
}

// --- Encoding ---

function encodeData(bytes: Uint8Array, ver: number): number[] {
  const capacityBits = numDataCodewords(ver) * 8;
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

function addEccAndInterleave(data: readonly number[], ver: number): number[] {
  const numBlocks = NUM_ECC_BLOCKS[ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
}

function drawFunctionPatterns(m: Matrix, ver: number) {
  const { size } = m;
  for (let i = 0; i < size; i++) {
    m.setFunction(6, i, i % 2 === 0);
    m.setFunction(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) m.setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const align = alignmentPositions(ver, size);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          m.setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  drawFormatBits(m, 0); // reserve; overwritten once the mask is chosen
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m.setFunction(a, b, bit);
      m.setFunction(b, a, bit);
    }
  }
}

function drawFormatBits(m: Matrix, mask: number) {
  const data = (ECL_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const { size } = m;

  for (let i = 0; i <= 5; i++) m.setFunction(8, i, getBit(bits, i));
  m.setFunction(8, 7, getBit(bits, 6));
  m.setFunction(8, 8, getBit(bits, 7));
  m.setFunction(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) m.setFunction(14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i++) m.setFunction(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) m.setFunction(8, size - 15 + i, getBit(bits, i));
  m.setFunction(8, size - 8, true); // always-dark module
}

function drawCodewords(m: Matrix, data: readonly number[]) {
  const { size } = m;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!m.isFunction[y][x] && i < data.length * 8) {
          m.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(m: Matrix, mask: number) {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.isFunction[y][x] && maskBit(mask, x, y)) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

/** Standard penalty score (rules N1-N4); lower is easier to scan. */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let y = 0; y < size; y++) lines.push([...modules[y]]);
  for (let x = 0; x < size; x++) lines.push(modules.map((row) => row[x]));

  const finderA = [true, false, true, true, true, false, true, false, false, false, false];
  const finderB = [false, false, false, false, true, false, true, true, true, false, true];
  for (const line of lines) {
    // N1: runs of 5+ same-colored modules.
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: finder-like 1:1:3:1:1 patterns with 4 light modules on one side.
    for (let i = 0; i + 11 <= line.length; i++) {
      if (finderA.every((v, k) => line[i + k] === v) || finderB.every((v, k) => line[i + k] === v)) score += 40;
    }
  }
  // N2: 2x2 blocks of one color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  // N4: balance of dark and light.
  const total = size * size;
  const dark = modules.reduce((acc, row) => acc + row.filter(Boolean).length, 0);
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

/**
 * Encode text (UTF-8) as a QR code at error correction level M.
 * Throws RangeError if it doesn't fit in version 10 (213 bytes).
 */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const headerBits = 4 + (ver <= 9 ? 8 : 16);
    if (headerBits + bytes.length * 8 <= numDataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new RangeError("Text is too long for a QR code");

  const size = ver * 4 + 17;
  const m = new Matrix(size);
  drawFunctionPatterns(m, ver);
  drawCodewords(m, addEccAndInterleave(encodeData(bytes, ver), ver));

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormatBits(m, mask);
    const score = penaltyScore(m.modules);
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
    applyMask(m, mask); // XOR again to undo
  }
  applyMask(m, best);
  drawFormatBits(m, best);
  return { size, version: ver, mask: best, modules: m.modules.map((row) => [...row]) };
}

/** SVG path data ("M x y h1 v1 h-1 z" per dark module), offset by a quiet zone. */
export function qrPath(code: QrCode, border = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }
  return parts.join("");
}
