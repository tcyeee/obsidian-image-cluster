import { SettingOptions } from "../core/domain";

/**
 * imgs 代码块内部文本的纯文本变换逻辑（解析/重建配置行、收缩剩余图片行等）。
 * 刻意与 persistence.ts 分开：这里不涉及任何 Obsidian API（TFile/vault/editor），
 * 只做字符串/数组层面的计算，方便脱离 Obsidian 运行时直接做单元测试
 * （"obsidian" 包本身只提供类型声明、没有可运行的 JS，任何在模块顶层引入
 * Notice/TFile 等值的文件都无法被 vitest 直接加载）。
 */

/** 代码块内部第一行的配置行（含 ";;" 的那一行），没有则为 null。 */
export function findConfigLine(innerLines: string[]): string | null {
    return innerLines.find(l => l.includes(";;")) ?? null;
}

/** 按「配置行（如果有） + 图片行」拼装代码块内部内容。 */
export function buildInnerLines(configLine: string | null, imageLines: string[]): string[] {
    return configLine ? [configLine, ...imageLines] : imageLines;
}

/**
 * 根据当前配置构造（或更新）代码块内部的文本内容。
 * 会保留原有的图片 Markdown，只替换/添加配置行。
 *
 * @param option - 配置对象
 * @param currentInner - 代码块内部内容
 * @returns 构造后的代码块内部内容
 */
export function buildInnerSourceFromOptions(option: SettingOptions, currentInner: string): string {
    const styleLine = option.buildStyleLineConfig();
    const endSign = ";;";

    // 原来没有任何配置，直接在最前面插入一行配置
    if (!currentInner.includes(endSign)) {
        const trimmed = currentInner.replace(/^\s*/, "");
        return `${styleLine}${endSign}\n${trimmed}`;
    }

    // 原来有配置，则删掉原有配置，写入新的配置
    const idx = currentInner.indexOf(endSign);
    if (idx === -1) {
        // 理论上不会走到这里，兜底按「无配置」处理
        const trimmed = currentInner.replace(/^\s*/, "");
        return `${styleLine}${endSign}\n${trimmed}`;
    }

    // 去掉旧配置与分隔符，仅保留之后的图片等内容
    const after = currentInner.slice(idx + endSign.length);
    const imagesPart = after.replace(/^[ \t\r\n]*/, "");
    return `${styleLine}${endSign}\n${imagesPart}`;
}

/**
 * 根据剩余图片行数，计算图片组代码块收缩后的新内容：
 * 剩 0 张则整个代码块一并删除，剩 1 张则拆包为普通图片行，2 张及以上保留 fence 并重建内部内容。
 * persistRemoveImageFromSource / persistExcludeImageToSource / persistDragOutToSource 共用这份收缩规则。
 */
export function buildShrunkGroupBlockLines(
    lines: string[],
    lineStart: number,
    lineEnd: number,
    remainingImageLines: string[],
): string[] {
    if (remainingImageLines.length === 0) return [];
    if (remainingImageLines.length === 1) return [remainingImageLines[0]];

    const innerLines = lines.slice(lineStart + 1, lineEnd);
    const configLine = findConfigLine(innerLines);
    const newInner = buildInnerLines(configLine, remainingImageLines);
    return [lines[lineStart], ...newInner, lines[lineEnd]];
}

/**
 * 在文件行数组中查找内部图片行（去掉配置行后）与给定快照完全一致的 imgs 代码块。
 * 用于 el/ctx 失效时的兜底定位——不依赖任何 DOM 引用，纯粹基于拖拽开始时记录的文本内容。
 */
export function findImgsBlockBySnapshot(
    lines: string[],
    imageLinesSnapshot: string[],
): { fenceStart: number; fenceEnd: number } | null {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== "```imgs") continue;
        let fenceEnd = -1;
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === "```") {
                fenceEnd = j;
                break;
            }
        }
        if (fenceEnd === -1) continue;

        const innerImageLines = lines.slice(i + 1, fenceEnd).filter(l => !l.includes(";;"));
        const matches =
            innerImageLines.length === imageLinesSnapshot.length &&
            innerImageLines.every((l, idx) => l === imageLinesSnapshot[idx]);
        if (matches) return { fenceStart: i, fenceEnd };

        i = fenceEnd;
    }
    return null;
}
