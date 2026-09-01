import { describe, expect, it } from "vitest";
import { config } from "../core/config";
import {
    buildGroupBlockForLine,
    getImageMatches,
    getImagePathMatches,
    getImageSyntaxes,
    hasMarkdownImage,
    imgsWrapper,
    isListLine,
    removeImageFromLine,
    wrapImageLineAsGroup,
} from "./image-syntax";

describe("imgsWrapper", () => {
    it("wraps a single image line into an imgs fenced block", () => {
        expect(imgsWrapper("![[a.png]]")).toBe("```imgs\n![[a.png]]\n```\n");
    });

    it("prefixes a padding-left config line when paddingLeft > 0", () => {
        expect(imgsWrapper("![[a.png]]", 28)).toBe("```imgs\npadding-left=28;;\n![[a.png]]\n```\n");
    });

    it("trims surrounding whitespace from the image syntax", () => {
        expect(imgsWrapper("   ![[a.png]]   ")).toBe("```imgs\n![[a.png]]\n```\n");
    });
});

describe("wrapImageLineAsGroup", () => {
    it("wraps a bare image line just like imgsWrapper", () => {
        expect(wrapImageLineAsGroup("![[a.png]]")).toBe("```imgs\n![[a.png]]\n```\n");
    });

    it("keeps text before the first image on the line above the block", () => {
        expect(wrapImageLineAsGroup("看这张图 ![[a.png]]")).toBe(
            "看这张图\n```imgs\n![[a.png]]\n```\n",
        );
    });

    it("keeps text after the last image on the line below the block", () => {
        expect(wrapImageLineAsGroup("![[a.png]] 很清楚")).toBe(
            "```imgs\n![[a.png]]\n```\n很清楚\n",
        );
    });

    it("preserves leading, in-between and trailing prose around multiple images", () => {
        expect(wrapImageLineAsGroup("prefix ![[a.png]] mid ![b](b.png) suffix")).toBe(
            "prefix\n```imgs\n![[a.png]]\n![b](b.png)\n```\nmid suffix\n",
        );
    });

    it("forwards paddingLeft to the fenced block", () => {
        expect(wrapImageLineAsGroup("cap ![[a.png]]", 28)).toBe(
            "cap\n```imgs\npadding-left=28;;\n![[a.png]]\n```\n",
        );
    });

    it("falls back to wrapping the whole line when there is no image", () => {
        expect(wrapImageLineAsGroup("just some text")).toBe("```imgs\njust some text\n```\n");
    });
});

describe("buildGroupBlockForLine", () => {
    it("returns null when the line has no image syntax", () => {
        expect(buildGroupBlockForLine("just a paragraph", "")).toBeNull();
    });

    it("wraps the line and keeps surrounding prose", () => {
        expect(buildGroupBlockForLine("看这张图 ![[a.png]] 很清楚", "")).toBe(
            "看这张图\n```imgs\n![[a.png]]\n```\n很清楚\n",
        );
    });

    it("follows the previous line's list indent", () => {
        expect(buildGroupBlockForLine("![[a.png]]", "- 列表项")).toBe(
            `\`\`\`imgs\npadding-left=${config.LIST_INDENT_PX};;\n![[a.png]]\n\`\`\`\n`,
        );
    });

    it("does not indent when the previous line is not a list", () => {
        expect(buildGroupBlockForLine("![[a.png]]", "普通段落")).toBe("```imgs\n![[a.png]]\n```\n");
    });
});

describe("isListLine", () => {
    it.each(["- item", "* item", "+ item", "1. item", "  - nested"])(
        "recognizes %s as a list line",
        (line) => {
            expect(isListLine(line)).toBe(true);
        },
    );

    it.each(["not a list", "", "![[a.png]]"])("does not treat %s as a list line", (line) => {
        expect(isListLine(line)).toBe(false);
    });
});

describe("hasMarkdownImage / getImageSyntaxes", () => {
    it("detects standard markdown images", () => {
        expect(hasMarkdownImage("![alt](a.png)")).toBe(true);
    });

    it("detects wiki-style embeds", () => {
        expect(hasMarkdownImage("![[a.png]]")).toBe(true);
    });

    it("returns false for plain text", () => {
        expect(hasMarkdownImage("just some text")).toBe(false);
    });

    it("extracts every image match on a line, newline-joined", () => {
        expect(getImageSyntaxes("prefix ![[a.png]] mid ![b](b.png)")).toBe("![[a.png]]\n![b](b.png)");
    });

    it("does not let a markdown image match swallow a preceding wiki link on the same line", () => {
        // 回归测试：!\[.*?\]\((.*?)\) 的旧写法会越过 Wiki 链接自己的 ]]，
        // 把两张图片合并成一个匹配，见 image-syntax.ts 中 getImageMatches 的注释。
        expect(getImageSyntaxes("![[a.png]] and ![b](b.png)")).toBe("![[a.png]]\n![b](b.png)");
    });

    it("falls back to the original line when there is no image", () => {
        expect(getImageSyntaxes("just some text")).toBe("just some text");
    });
});

describe("getImageMatches", () => {
    it("returns start/end offsets for each match on the line", () => {
        const line = "![[a.png]] and ![b](b.png)";
        const matches = getImageMatches(line);
        expect(matches).toHaveLength(2);
        expect(matches[0]).toEqual({ text: "![[a.png]]", start: 0, end: 10 });
        expect(line.slice(matches[1].start, matches[1].end)).toBe("![b](b.png)");
    });

    it("returns an empty array when there is no image", () => {
        expect(getImageMatches("no image here")).toEqual([]);
    });
});

describe("getImagePathMatches", () => {
    it("extracts the raw path from a standard markdown image", () => {
        expect(getImagePathMatches("![alt](folder/a.png)")).toEqual([
            { text: "![alt](folder/a.png)", rawPath: "folder/a.png" },
        ]);
    });

    it("extracts the raw path from a wiki embed, stripping alias and heading", () => {
        expect(getImagePathMatches("![[a.png|300]]")).toEqual([{ text: "![[a.png|300]]", rawPath: "a.png" }]);
        expect(getImagePathMatches("![[a.png#^block]]")).toEqual([
            { text: "![[a.png#^block]]", rawPath: "a.png" },
        ]);
    });

    it("extracts every image on a line that has more than one", () => {
        const matches = getImagePathMatches("![[a.png]] ![[b.png]]");
        expect(matches).toEqual([
            { text: "![[a.png]]", rawPath: "a.png" },
            { text: "![[b.png]]", rawPath: "b.png" },
        ]);
    });

    it("does not let a markdown image match swallow a preceding wiki link on the same line", () => {
        const matches = getImagePathMatches("![[a.png]] and ![b](b.png)");
        expect(matches).toEqual([
            { text: "![[a.png]]", rawPath: "a.png" },
            { text: "![b](b.png)", rawPath: "b.png" },
        ]);
    });

    it("returns an empty array for a line with no image", () => {
        expect(getImagePathMatches("no image here")).toEqual([]);
    });
});

describe("removeImageFromLine", () => {
    it("removes the only image on a line and reports the line as empty", () => {
        const result = removeImageFromLine("![[a.png]]", 0);
        expect(result).toEqual({ text: "", empty: true });
    });

    it("strips a leading list marker when checking for emptiness", () => {
        const result = removeImageFromLine("- ![[a.png]]", 0);
        expect(result.empty).toBe(true);
    });

    it("keeps other text on the line and reports it as non-empty", () => {
        const result = removeImageFromLine("caption ![[a.png]] more text", 0);
        expect(result).toEqual({ text: "caption more text", empty: false });
    });

    it("removes only the targeted match, keeping other images on the same line", () => {
        const result = removeImageFromLine("![[a.png]] ![[b.png]]", 1);
        expect(result).toEqual({ text: "![[a.png]]", empty: false });
    });

    it("returns the original line unchanged when matchIndex is out of range", () => {
        const result = removeImageFromLine("![[a.png]]", 5);
        expect(result).toEqual({ text: "![[a.png]]", empty: false });
    });
});
