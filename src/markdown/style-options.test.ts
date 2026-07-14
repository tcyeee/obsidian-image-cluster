import { describe, expect, it } from "vitest";
import { config } from "../core/config";
import { SettingOptions } from "../core/domain";
import { parseStyleOptions } from "./style-options";

describe("parseStyleOptions", () => {
    it("returns defaults when there is no config line", () => {
        const options = parseStyleOptions("![[a.png]]\n![[b.png]]");
        expect(options.size).toBe(config.DEFAULT_SIZE);
        expect(options.shadow).toBe(config.DEFAULT_SHADOW);
        expect(options.border).toBe(config.DEFAULT_BORDER);
    });

    it("parses every recognized key from the config line", () => {
        const source = "size=220&gap=10&radius=10&shadow=true&border=true&hidden=true&limit=true&padding-left=28;;\n![[a.png]]";
        const options = parseStyleOptions(source);
        expect(options.size).toBe(220);
        expect(options.gap).toBe(10);
        expect(options.radius).toBe(10);
        expect(options.shadow).toBe(true);
        expect(options.border).toBe(true);
        expect(options.hidden).toBe(true);
        expect(options.limit).toBe(true);
        expect(options.paddingLeft).toBe(28);
    });

    it("ignores out-of-range numeric values, keeping the default", () => {
        const options = parseStyleOptions("size=9999&gap=-5&radius=9999;;\n![[a.png]]");
        expect(options.size).toBe(config.DEFAULT_SIZE);
        expect(options.gap).toBe(config.DEFAULT_GAP);
        expect(options.radius).toBe(config.DEFAULT_RADIUS);
    });

    it("ignores malformed key=value pairs instead of throwing", () => {
        expect(() => parseStyleOptions("size&gap=;;\n![[a.png]]")).not.toThrow();
    });

    it("round-trips with SettingOptions.buildStyleLineConfig", () => {
        const options = new SettingOptions();
        options.size = 180;
        options.gap = 12;
        options.radius = 6;
        options.shadow = true;
        options.border = false;
        options.hidden = true;
        options.limit = false;
        options.paddingLeft = 28;

        const line = options.buildStyleLineConfig();
        const reparsed = parseStyleOptions(`${line};;\n![[a.png]]`);

        expect(reparsed.size).toBe(options.size);
        expect(reparsed.gap).toBe(options.gap);
        expect(reparsed.radius).toBe(options.radius);
        expect(reparsed.shadow).toBe(options.shadow);
        expect(reparsed.border).toBe(options.border);
        expect(reparsed.hidden).toBe(options.hidden);
        expect(reparsed.limit).toBe(options.limit);
        expect(reparsed.paddingLeft).toBe(options.paddingLeft);
    });
});
