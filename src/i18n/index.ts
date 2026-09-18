import { en, Translations } from "./en";
import { zh } from "./zh";

export type LanguagePreference = "auto" | "en" | "zh";

/**
 * Obsidian 没有面向插件的官方 i18n API：桌面/移动端客户端都会把用户选择的显示语言
 * 写入 localStorage 的 "language" 键（如 "en"、"zh"、"zh-TW"），社区插件普遍依赖这个
 * 事实行为做语言检测。仅在 language 设置为 "auto"（跟随 Obsidian）时使用。
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

/**
 * `t` 是所有模块共享的同一个对象引用。切换语言时原地替换它的字段（而不是重新赋值
 * `t` 本身），这样已经 `import { t }` 的模块无需重新加载就能读到新语言的文案。
 */
export const t: Translations = { ...en };

export function setLocale(preference: LanguagePreference): void {
    const locale = preference === "auto" ? detectLocale() : preference;
    Object.assign(t, locale === "zh" ? zh : en);
}

setLocale("auto");
