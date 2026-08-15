import { describe, expect, it } from "vitest";
import { SettingOptions } from "../core/domain";
import {
    buildInnerSourceFromOptions,
    buildShrunkGroupBlockLines,
    findImgsBlockBySnapshot,
} from "./block-text";

describe("buildInnerSourceFromOptions", () => {
    it("inserts a config line in front when there was none", () => {
        const options = new SettingOptions();
        const result = buildInnerSourceFromOptions(options, "![[a.png]]\n![[b.png]]");
        expect(result).toBe(`${options.buildStyleLineConfig()};;\n![[a.png]]\n![[b.png]]`);
    });

    it("replaces an existing config line, keeping the image lines untouched", () => {
        const options = new SettingOptions();
        options.size = 220;
        const currentInner = "size=90&gap=5&radius=8&shadow=false&border=false&hidden=false&limit=false&padding-left=0;;\n![[a.png]]";
        const result = buildInnerSourceFromOptions(options, currentInner);
        expect(result).toBe(`${options.buildStyleLineConfig()};;\n![[a.png]]`);
    });

    it("is a no-op (produces the same content) when nothing actually changed", () => {
        const options = new SettingOptions();
        const currentInner = `${options.buildStyleLineConfig()};;\n![[a.png]]`;
        expect(buildInnerSourceFromOptions(options, currentInner)).toBe(currentInner);
    });
});

describe("buildShrunkGroupBlockLines", () => {
    // 一个三张图片的代码块：行 0 是 ```imgs，行 4 是 ```
    const lines = [
        "```imgs",
        "size=150&gap=8&radius=10&shadow=false&border=false&hidden=false&limit=false&padding-left=0;;",
        "![[a.png]]",
        "![[b.png]]",
        "```",
    ];

    it("returns an empty block when no images remain", () => {
        expect(buildShrunkGroupBlockLines(lines, 0, 4, [])).toEqual([]);
    });

    it("unwraps into a single plain image line when exactly one image remains", () => {
        expect(buildShrunkGroupBlockLines(lines, 0, 4, ["![[a.png]]"])).toEqual(["![[a.png]]"]);
    });

    it("keeps the fence and config line, rebuilding the inner content, when 2+ images remain", () => {
        const result = buildShrunkGroupBlockLines(lines, 0, 4, ["![[a.png]]", "![[c.png]]"]);
        expect(result).toEqual([
            "```imgs",
            "size=150&gap=8&radius=10&shadow=false&border=false&hidden=false&limit=false&padding-left=0;;",
            "![[a.png]]",
            "![[c.png]]",
            "```",
        ]);
    });

    it("rebuilds without a config line when the block never had one", () => {
        const noConfigLines = ["```imgs", "![[a.png]]", "![[b.png]]", "```"];
        const result = buildShrunkGroupBlockLines(noConfigLines, 0, 3, ["![[a.png]]", "![[c.png]]"]);
        expect(result).toEqual(["```imgs", "![[a.png]]", "![[c.png]]", "```"]);
    });
});

describe("findImgsBlockBySnapshot", () => {
    it("locates the imgs block whose inner image lines match the snapshot exactly", () => {
        const lines = [
            "some text",
            "```imgs",
            "size=150;;",
            "![[a.png]]",
            "![[b.png]]",
            "```",
            "trailing text",
        ];
        const result = findImgsBlockBySnapshot(lines, ["![[a.png]]", "![[b.png]]"]);
        expect(result).toEqual({ fenceStart: 1, fenceEnd: 5 });
    });

    it("skips blocks whose image lines don't match, and picks the matching one among several", () => {
        const lines = [
            "```imgs",
            "![[x.png]]",
            "```",
            "```imgs",
            "![[a.png]]",
            "![[b.png]]",
            "```",
        ];
        const result = findImgsBlockBySnapshot(lines, ["![[a.png]]", "![[b.png]]"]);
        expect(result).toEqual({ fenceStart: 3, fenceEnd: 6 });
    });

    it("returns null when no block matches the snapshot", () => {
        const lines = ["```imgs", "![[a.png]]", "```"];
        expect(findImgsBlockBySnapshot(lines, ["![[does-not-exist.png]]"])).toBeNull();
    });

    it("returns null when there is no imgs block at all", () => {
        expect(findImgsBlockBySnapshot(["just text", "more text"], ["![[a.png]]"])).toBeNull();
    });

    it("returns null for an unterminated fence (missing closing ```)", () => {
        const lines = ["```imgs", "![[a.png]]"];
        expect(findImgsBlockBySnapshot(lines, ["![[a.png]]"])).toBeNull();
    });
});
