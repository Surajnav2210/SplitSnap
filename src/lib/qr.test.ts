import { describe, expect, it } from "vitest";
import { encodeQr, penaltyScore, qrPath } from "./qr";

// Golden matrix for "a" (version 1, level M). Verified to decode with an
// independent QR reader when this encoder was written; guards regressions.
const GOLDEN_A = [
  "#######..#.##.#######",
  "#.....#.#.##..#.....#",
  "#.###.#.##.#..#.###.#",
  "#.###.#.#.##..#.###.#",
  "#.###.#..#..#.#.###.#",
  "#.....#...##..#.....#",
  "#######.#.#.#.#######",
  "........##...........",
  "#.....#.#.##.##..###.",
  "#..##......###.###..#",
  "..#.###..##.#.##.....",
  ".#.#.#.##..#####.#.#.",
  "##.#..####.##########",
  "........##..#.....#.#",
  "#######..###.#..####.",
  "#.....#...#...#...###",
  "#.###.#..###.#..###..",
  "#.###.#..#.#####.#...",
  "#.###.#..#.###.###.##",
  "#.....#...######.#...",
  "#######.#.#.#..#..##.",
];

const rows = (modules: boolean[][]) => modules.map((r) => r.map((b) => (b ? "#" : ".")).join(""));

function finderAt(modules: boolean[][], x0: number, y0: number): string[] {
  return modules.slice(y0, y0 + 7).map((r) => r.slice(x0, x0 + 7).map((b) => (b ? "#" : ".")).join(""));
}

const FINDER = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];

describe("encodeQr", () => {
  it("matches the golden matrix", () => {
    expect(rows(encodeQr("a").modules)).toEqual(GOLDEN_A);
  });

  it("picks the smallest version that fits", () => {
    expect(encodeQr("a").version).toBe(1);
    expect(encodeQr("x".repeat(14)).version).toBe(1); // v1-M holds 14 bytes
    expect(encodeQr("x".repeat(15)).version).toBe(2);
    const share = encodeQr("https://splitsnap.vercel.app/b/abcdefghjkmn");
    expect(share.version).toBe(4);
    expect(share.size).toBe(33);
  });

  it("draws finder and timing patterns", () => {
    for (const text of ["a", "https://example.com/" + "y".repeat(100)]) {
      const { modules, size } = encodeQr(text);
      expect(modules).toHaveLength(size);
      expect(finderAt(modules, 0, 0)).toEqual(FINDER);
      expect(finderAt(modules, size - 7, 0)).toEqual(FINDER);
      expect(finderAt(modules, 0, size - 7)).toEqual(FINDER);
      for (let i = 8; i < size - 8; i++) {
        expect(modules[6][i]).toBe(i % 2 === 0);
        expect(modules[i][6]).toBe(i % 2 === 0);
      }
      expect(modules[size - 8][8]).toBe(true); // dark module
    }
  });

  it("is deterministic and handles UTF-8", () => {
    expect(encodeQr("héllo ✓")).toEqual(encodeQr("héllo ✓"));
  });

  it("rejects text that doesn't fit version 10", () => {
    expect(encodeQr("x".repeat(213)).version).toBe(10);
    expect(() => encodeQr("x".repeat(214))).toThrow(RangeError);
  });
});

describe("qrPath / penaltyScore", () => {
  it("emits one square per dark module, offset by the quiet zone", () => {
    const code = encodeQr("a");
    const dark = code.modules.flat().filter(Boolean).length;
    const path = qrPath(code);
    expect(path.match(/M/g)).toHaveLength(dark);
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
  });

  it("scores a uniform matrix worse than a checkerboard", () => {
    const n = 21;
    const solid = Array.from({ length: n }, () => new Array<boolean>(n).fill(true));
    const checker = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x + y) % 2 === 0));
    expect(penaltyScore(solid)).toBeGreaterThan(penaltyScore(checker));
  });
});
