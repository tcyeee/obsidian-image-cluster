import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { SettingOptions } from "../core/domain";

/**
 * 将当前 option 写回到对应 Markdown 文档的代码块中（更新/插入配置行）。
 *
 * 约定格式：
 *   size=220&gap=10&radius=10&shadow=false&border=false;;
 *   ![img](...)
 *
 * 注意：
 * - 之前用 editor.replaceRange 在某些情况下（多窗口 / 预览模式等）会出现「逻辑上写入成功但在 Obsidian 里看不到」的问题。
 * - 这里改为直接基于 Vault 文件内容进行修改，再整体写回，保证预览和编辑视图都能正确刷新。
 *
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 */
export async function persistOptionsToSource(option: SettingOptions, plugin: ImgRowPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement): Promise<void> {
    const section = ctx.getSectionInfo(el);
    if (!section) return;

    // 通过 ctx.sourcePath 拿到真正的文件，而不是依赖当前激活视图
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    // 读取整篇文档文本
    const content = await plugin.app.vault.read(file);
    const lines = content.split("\n");

    // 代码块内部内容所在的行范围：
    // section.lineStart    -> ```imgs 这一行
    // section.lineStart+1  -> 代码块内部第一行
    // section.lineEnd      -> ``` 这一行
    const innerStart = section.lineStart + 1;
    const innerEnd = section.lineEnd;

    if (innerStart >= innerEnd || innerStart < 0 || innerEnd > lines.length) return;

    const currentInner = lines.slice(innerStart, innerEnd).join("\n");
    const newInner = buildInnerSourceFromOptions(option, currentInner);
    if (newInner === currentInner) return;

    // buildInnerSourceFromOptions 可能会在末尾带一个换行，这里统一拆成行数组
    const newInnerLines = newInner.endsWith("\n")
        ? newInner.slice(0, -1).split("\n")
        : newInner.split("\n");

    const newLines = [
        ...lines.slice(0, innerStart),
        ...newInnerLines,
        ...lines.slice(innerEnd),
    ];

    await plugin.app.vault.modify(file, newLines.join("\n"));
}

/**
 * 根据当前配置构造（或更新）代码块内部的文本内容。
 * 会保留原有的图片 Markdown，只替换/添加配置行。
 *
 * @param option - 配置对象
 * @param currentInner - 代码块内部内容
 * @returns 构造后的代码块内部内容
 */
function buildInnerSourceFromOptions(option: SettingOptions, currentInner: string): string {
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
 * 将当前 DOM 中 wrapper 的排列顺序写回对应 Markdown 文件的代码块。
 */
export async function persistReorderToSource(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): Promise<void> {
    const section = ctx.getSectionInfo(el);
    if (!section) return;

    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const content = await plugin.app.vault.read(file);
    const lines = content.split("\n");

    const innerStart = section.lineStart + 1;
    const innerEnd = section.lineEnd;
    if (innerStart >= innerEnd || innerStart < 0 || innerEnd > lines.length) return;

    const innerLines = lines.slice(innerStart, innerEnd);

    // 保留配置行（含 ;; 的行）
    const configLine = innerLines.find(l => l.includes(";;")) ?? null;

    // 按 DOM 当前顺序读取各 wrapper 存储的原始 markdown 图片行
    const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"));
    const newImageLines = wrappers.map(w => w.dataset.imgLine).filter(Boolean) as string[];
    if (newImageLines.length === 0) return;

    const newInner = configLine
        ? `${configLine}\n${newImageLines.join("\n")}`
        : newImageLines.join("\n");

    const newLines = [
        ...lines.slice(0, innerStart),
        ...newInner.split("\n"),
        ...lines.slice(innerEnd),
    ];

    await plugin.app.vault.modify(file, newLines.join("\n"));
}
