import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { SettingOptions } from "../core/domain";
import { GroupDragPayload } from "../drag-state";

/**
 * 按文件路径排队执行「读整篇文件 -> 计算新内容 -> 写回」的持久化操作，确保同一个文件的
 * 多次调用严格串行执行，不会相互交叉。
 *
 * 背景：拖入图片组等操作都是先 vault.read() 再写回的异步流程。如果短时间内连续触发多次
 * （例如连续拖入好几张图），后一次的 vault.read() 可能发生在前一次的写入生效之前，读到
 * 过期内容；写回时 writeFileContent 发现编辑器当前文档已经和这份过期内容不一致，会放弃走
 * 编辑器 dispatch、退回整篇 vault.modify——而 vault.modify 会被 Obsidian 当作「外部修改」
 * 触发一次不了解 Live Preview widget 边界的合并，表现为图片组渲染短暂错乱（重复图片、
 * 拖拽指示条错位等，已通过日志实测确认）。这里用按路径分组的 Promise 队列，保证同一文件的
 * 操作一个接一个执行，后一个的读永远发生在前一个的写完成之后。
 */
const fileOpQueues = new Map<string, Promise<void>>();

function enqueueFileOp<T>(path: string, op: () => Promise<T>): Promise<T> {
    const prev = fileOpQueues.get(path) ?? Promise.resolve();
    const result = prev.then(op, op);
    // 无论成功失败都要让队列继续往前走，否则一次失败会卡住这个文件后续所有操作
    fileOpQueues.set(path, result.then(() => undefined, () => undefined));
    return result;
}

/**
 * 读取「当前」文件内容，作为读-改-写流程的起点。
 *
 * 优先从 el 所在的 CodeMirror 编辑器读取（若存在），而不是 plugin.app.vault.read(file)：
 * 实测发现 vault.read() 对「正在编辑中」的文件会滞后于编辑器里的实时内容（编辑器已经有
 * 最新一行，vault.read() 还读到少一行的旧版本），这个滞后期内如果恰好有拖拽等操作基于
 * vault.read() 的结果计算行号，算出来的行号会比编辑器实际的行数更靠后，导致越界校验
 * 误判为「行号非法」而静默放弃——而此时 DOM 侧的乐观更新（例如插入的临时 wrapper）已经
 * 发生且不会回滚，表现为图片被"拖入"了图片组，但源图片所在的位置还留着一份没被清理。
 * 直接从编辑器读，保证这里拿到的内容和拖拽发起时基于同一份 CodeMirror 文档计算出的行号
 * 永远是一致的。
 */
function readCurrentContent(plugin: ImgRowPlugin, file: TFile, el: HTMLElement): Promise<string> {
    const editorRoot = el.closest(".cm-editor") as HTMLElement | null;
    const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
    if (view) return Promise.resolve(view.state.doc.toString());
    return plugin.app.vault.read(file);
}

/**
 * 把新内容写回文件。
 *
 * 优先通过 el 所在的 CodeMirror 编辑器（Live Preview 下这些持久化函数只会在这种上下文中被调用）
 * 直接 dispatch 一次变更，而不是调用 vault.modify 直接改写磁盘文件。
 *
 * 原因：这些函数改动的都是「当前正在被编辑」的文件——vault.modify 是脱离编辑器事务系统的
 * 磁盘写入，Obsidian 的文件监听会把它识别为「外部修改」，从而弹出「已被外部修改，正在自动合并」
 * 提示并触发一次以文本 diff 为基础的合并，这个合并过程不了解 Live Preview 的 widget 边界，
 * 会导致图片组渲染短暂错乱。通过同一个 EditorView 直接 dispatch，改动被当作编辑器自身的
 * 事务处理，不会触发这条外部修改路径。
 *
 * 只在找不到对应编辑器时（理论上不会发生，属于防御性兜底）才回退到 vault.modify。
 */
async function writeFileContent(
    plugin: ImgRowPlugin,
    file: TFile,
    el: HTMLElement,
    oldContent: string,
    newContent: string,
): Promise<void> {
    const editorRoot = el.closest(".cm-editor") as HTMLElement | null;
    const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;

    if (view && view.state.doc.toString() === oldContent) {
        // 只替换实际发生变化的最小区间（公共前缀/后缀不动），
        // 既能让 CodeMirror 尽量保留光标/滚动位置，也降低误伤无关内容的风险。
        let start = 0;
        const maxStart = Math.min(oldContent.length, newContent.length);
        while (start < maxStart && oldContent[start] === newContent[start]) start++;

        let oldEnd = oldContent.length;
        let newEnd = newContent.length;
        while (oldEnd > start && newEnd > start && oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
            oldEnd--;
            newEnd--;
        }

        view.dispatch({
            changes: { from: start, to: oldEnd, insert: newContent.slice(start, newEnd) },
        });
        return;
    }

    // 编辑器不存在，或其内容与我们读到的 oldContent 已经不一致（说明期间发生了其他变更，
    // 基于旧内容计算出的区间不再可信）：退回整篇写入 vault，保证正确性优先。
    await plugin.app.vault.modify(file, newContent);
}

/**
 * 将当前 option 写回到对应 Markdown 文档的代码块中（更新/插入配置行）。
 *
 * 约定格式：
 *   size=220&gap=10&radius=10&shadow=false&border=false;;
 *   ![img](...)
 *
 * 注意：
 * - 基于 Vault 文件内容计算出完整的新内容后，通过 writeFileContent 写回：
 *   若 el 所在的 CodeMirror 编辑器仍然打开且内容未变，直接对该编辑器 dispatch 一次最小变更
 *   （避免触发 Obsidian 的「外部修改」合并，见 writeFileContent 注释）；否则退回 vault.modify。
 * - 整个读-改-写过程通过 enqueueFileOp 按文件路径排队，避免和同一文件上的其他持久化调用交叉。
 *
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 */
export async function persistOptionsToSource(option: SettingOptions, plugin: ImgRowPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement): Promise<void> {
    await enqueueFileOp(ctx.sourcePath, async () => {
        const section = ctx.getSectionInfo(el);
        if (!section) return;

        // 通过 ctx.sourcePath 拿到真正的文件，而不是依赖当前激活视图
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;

        // 读取整篇文档文本
        const content = await readCurrentContent(plugin, file, el);
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

        await writeFileContent(plugin, file, el, content, newLines.join("\n"));
    });
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
 * 整个读-改-写过程通过 enqueueFileOp 按文件路径排队，避免和同一文件上的其他持久化调用交叉。
 */
export async function persistReorderToSource(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): Promise<void> {
    await enqueueFileOp(ctx.sourcePath, async () => {
        const section = ctx.getSectionInfo(el);
        if (!section) return;

        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;

        const content = await readCurrentContent(plugin, file, el);
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

        await writeFileContent(plugin, file, el, content, newLines.join("\n"));
    });
}

/**
 * 把一张「独立图片」拖入某个已有的图片组：一次读改写同时完成
 * 「删除源图片所在行」与「按 DOM 顺序重建目标代码块内容」，避免分两次写入文件产生竞态。
 * 整个读-改-写过程通过 enqueueFileOp 按文件路径排队，避免和同一文件上的其他持久化调用交叉
 * ——这也是连续快速拖入多张图片时不再触发「外部修改」合并、导致渲染错乱的关键。
 *
 * @param container - 目标图片组的容器（DOM 顺序即最终写回顺序，含新拖入的临时 wrapper）
 * @param sourcePath - 源图片所在文件路径；必须与目标图片组所在文件（ctx.sourcePath）一致，
 *   否则说明是跨文件拖拽（暂不支持），直接放弃，避免删错文件里的行
 * @param sourceLineIndex - 源图片所在行的行号（0 基，落盘前的文件行号）
 * @returns 是否成功写入。调用方（drag-sort.ts）在失败时需要把乐观插入的临时 wrapper 从
 *   DOM 中移除——否则会出现"图片显示进了图片组，但源位置的图片也没消失"的重复图片问题。
 */
export async function persistDragInsertToSource(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    sourcePath: string,
    sourceLineIndex: number,
): Promise<boolean> {
    if (sourcePath !== ctx.sourcePath) return false;

    return enqueueFileOp(ctx.sourcePath, async () => {
        const section = ctx.getSectionInfo(el);
        if (!section) return false;

        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return false;

        const content = await readCurrentContent(plugin, file, el);
        const lines = content.split("\n");
        if (sourceLineIndex < 0 || sourceLineIndex >= lines.length) return false;

        // 先删除源图片所在行；如果它在目标代码块之前，代码块的行号范围要整体减一
        lines.splice(sourceLineIndex, 1);
        let innerStart = section.lineStart + 1;
        let innerEnd = section.lineEnd;
        if (sourceLineIndex < innerStart) {
            innerStart -= 1;
            innerEnd -= 1;
        }

        if (innerStart >= innerEnd || innerStart < 0 || innerEnd > lines.length) return false;

        const innerLines = lines.slice(innerStart, innerEnd);
        const configLine = innerLines.find(l => l.includes(";;")) ?? null;

        // 按 DOM 当前顺序读取各 wrapper（含新拖入的临时 wrapper）存储的原始 markdown 图片行
        const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"));
        const newImageLines = wrappers.map(w => w.dataset.imgLine).filter(Boolean) as string[];
        if (newImageLines.length === 0) return false;

        const newInner = configLine
            ? `${configLine}\n${newImageLines.join("\n")}`
            : newImageLines.join("\n");

        const newLines = [
            ...lines.slice(0, innerStart),
            ...newInner.split("\n"),
            ...lines.slice(innerEnd),
        ];

        await writeFileContent(plugin, file, el, content, newLines.join("\n"));
        return true;
    });
}

/**
 * 在文件行数组中查找内部图片行（去掉配置行后）与给定快照完全一致的 imgs 代码块。
 * 用于 el/ctx 失效时的兜底定位——不依赖任何 DOM 引用，纯粹基于拖拽开始时记录的文本内容。
 */
function findImgsBlockBySnapshot(
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

/**
 * 把图片组内的一张图片拖出，变成编辑器中一行独立的 Markdown 图片：一次读改写同时完成
 * 「从原图片组代码块中移除该图片」与「在目标位置插入这一行」，避免分两次写入文件产生行号错位。
 * 整个读-改-写过程通过 enqueueFileOp 按文件路径排队，避免和同一文件上的其他持久化调用交叉。
 *
 * @param groupDrag - 被拖出图片的来源信息（图片组容器、代码块 ctx/el、原始 Markdown 行等）
 * @param plugin - 插件实例
 * @param targetLineIndex - 目标插入位置的行号（0 基，落盘前、修改前的文件行号）
 * @param insertBefore - true 表示插入到目标行之前，false 表示插入到目标行之后
 */
export async function persistDragOutToSource(
    groupDrag: GroupDragPayload,
    plugin: ImgRowPlugin,
    targetLineIndex: number,
    insertBefore: boolean,
): Promise<void> {
    await enqueueFileOp(groupDrag.sourcePath, async () => {
        const file = plugin.app.vault.getAbstractFileByPath(groupDrag.sourcePath);
        if (!(file instanceof TFile)) return;

        const content = await readCurrentContent(plugin, file, groupDrag.el);
        const lines = content.split("\n");

        // el 可能在拖拽过程中因为这个代码块被重渲染（例如同一文件其他地方的编辑触发了整篇重新解析）
        // 而失效；优先走 ctx.getSectionInfo，失败时退回按拖拽开始时记录的图片行快照在当前文件里
        // 重新定位代码块，而不是静默放弃——避免"看起来拖出成功了，其实文件根本没变"。
        const section = groupDrag.el.isConnected ? groupDrag.ctx.getSectionInfo(groupDrag.el) : null;
        const located = section
            ? { fenceStart: section.lineStart, fenceEnd: section.lineEnd }
            : findImgsBlockBySnapshot(lines, groupDrag.imageLinesSnapshot);

        if (!located) {
            new Notice("拖出图片失败：找不到原图片组，请重试一次");
            return;
        }
        const { fenceStart, fenceEnd } = located; // fenceStart: ```imgs 这一行；fenceEnd: ``` 这一行
        if (fenceStart < 0 || fenceEnd >= lines.length || fenceStart > fenceEnd) return;

        // 目标位置必须落在原代码块范围之外，否则视为无效目标（理论上不会发生：
        // editor-drop-target.ts 已经在 DOM 层面排除了落在图片组容器内部的情况，这里是防御）
        if (targetLineIndex >= fenceStart && targetLineIndex <= fenceEnd) return;

        const innerStart = fenceStart + 1;
        const innerEnd = fenceEnd;
        const innerLines = lines.slice(innerStart, innerEnd);
        const configLine = innerLines.find(l => l.includes(";;")) ?? null;

        // 剩余图片直接由拖拽开始时记录的快照计算（按下标而不是按文本内容剔除被拖出的那一张，
        // 避免组内出现完全相同的图片行时被误删多个）。拖拽过程中不可能再发生另一次组内重排
        // （同一时刻只能有一个拖拽在进行），所以快照顺序足以代表当前状态，不再依赖可能已经
        // 过期的 DOM（groupDrag.container/wrapper）。
        const remainingImageLines = groupDrag.imageLinesSnapshot.filter((_, idx) => idx !== groupDrag.draggedIndex);

        let newBlockLines: string[];
        if (remainingImageLines.length === 0) {
            // 图片组被掏空：整个代码块一并删除
            newBlockLines = [];
        } else if (remainingImageLines.length === 1) {
            // 只剩 1 张：自动拆包为一行普通图片，不再保留代码块
            newBlockLines = [remainingImageLines[0]];
        } else {
            // 仍有 2 张及以上：保留 fence，重建内部内容
            const newInner = configLine ? [configLine, ...remainingImageLines] : remainingImageLines;
            newBlockLines = [lines[fenceStart], ...newInner, lines[fenceEnd]];
        }

        const originalBlockLength = fenceEnd - fenceStart + 1;
        const delta = newBlockLines.length - originalBlockLength;

        const newLines = [...lines];
        newLines.splice(fenceStart, originalBlockLength, ...newBlockLines);

        // 目标行在原代码块之后时，要按整块的行数差做偏移修正；目标行在原代码块之前则不受影响
        const adjustedTargetIndex = targetLineIndex > fenceEnd ? targetLineIndex + delta : targetLineIndex;
        const insertAt = insertBefore ? adjustedTargetIndex : adjustedTargetIndex + 1;
        newLines.splice(insertAt, 0, groupDrag.markdown);

        await writeFileContent(plugin, file, groupDrag.el, content, newLines.join("\n"));
    });
}
