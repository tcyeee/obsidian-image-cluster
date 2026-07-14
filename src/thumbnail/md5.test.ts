import { describe, expect, it } from "vitest";
import { md5 } from "./md5";

// 与标准 MD5 值比对（仅对 ASCII 输入成立，见 md5.ts 顶部注释：UTF-16 code unit 当字节处理）。
describe("md5", () => {
    it("matches the known MD5 of an empty string", () => {
        expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    });

    it("matches the known MD5 of a short ASCII string", () => {
        expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    });

    it("matches the known MD5 of a string spanning multiple 64-byte blocks", () => {
        expect(md5("The quick brown fox jumps over the lazy dog")).toBe(
            "9e107d9d372bb6826bd81d3542a419d6",
        );
    });

    it("is deterministic for the same input", () => {
        expect(md5("assets/1.png")).toBe(md5("assets/1.png"));
    });

    it("produces different hashes for different paths", () => {
        expect(md5("assets/1.png")).not.toBe(md5("assets/2.png"));
    });
});
