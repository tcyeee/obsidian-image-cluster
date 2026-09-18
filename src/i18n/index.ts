import { en } from "./en";
import { zh } from "./zh";

/**
 * Obsidian 没有面向插件的官方 i18n API：桌面/移动端客户端都会把用户选择的显示语言
 * 写入 localStorage 的 "language" 键（如 "en"、"zh"、"zh-TW"），社区插件普遍依赖这个
 * 事实行为做语言检测。语言只在应用重启时生效，因此这里只在模块加载时判断一次即可。
 */
function detectLocale(): "en" | "zh" {
    try {
        const stored = window.localStorage.getItem("language");
        if (stored) return stored.toLowerCase().startsWith("zh") ? "zh" : "en";
    } catch {
        // localStorage 在某些运行环境（如测试）下可能不可用，忽略并回退到 navigator.language
    }
    const nav = typeof navigator !== "undefined" ? navigator.language : "en";
    return nav?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const t = detectLocale() === "zh" ? zh : en;
