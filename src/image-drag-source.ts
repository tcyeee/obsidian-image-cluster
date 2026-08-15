import ImgRowPlugin from "main";
import { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { getImageMatches } from "./markdown/image-syntax";
import { STANDALONE_IMAGE_DRAG_MIME, setCurrentDrag } from "./drag-state";

/** 根据 DOM 节点找到承载它的 Markdown 文件路径，用于校验拖拽源和落点必须同一个文件 */
function getFilePathForNode(plugin: ImgRowPlugin, node: HTMLElement): string | null {
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.containerEl.contains(node)) {
            return view.file?.path ?? null;
        }
    }
    return null;
}

/**
 * 允许把「未成组」的独立图片（Live Preview 中的普通 ![[..]] / ![]() 渲染出的 <img>）
 * 拖拽到已有的图片组中。只负责拖拽起点（dragstart/dragend），落点逻辑在 drag-sort.ts。
 */
export function registerImageDragSource(plugin: ImgRowPlugin) {
    // target 用 Node（而不是 EventTarget）承接，配合 .instanceOf() 做跨窗口安全的类型判断——
    // 弹出窗口里每个 window 有各自的 HTMLImageElement 构造函数，裸 instanceof 会失效。
    // 调用方传入的是 UIEvent.targetNode（Obsidian 的跨窗口安全扩展）而非裸的 e.target。
    const isEligibleImage = (target: Node | null): target is HTMLImageElement => {
        if (!target || !target.instanceOf(HTMLImageElement)) return false;
        if (!target.closest(".cm-content")) return false; // 仅 Live Preview
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    plugin.registerDomEvent(activeDocument, "dragstart", (e: DragEvent) => {
        if (!plugin.settings.enableDragToGroup) return;
        const img = e.targetNode;
        if (!isEligibleImage(img)) return;

        const editorRoot = img.closest<HTMLElement>(".cm-editor");
        const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
        if (!view) return;

        const pos = view.posAtDOM(img);
        const line = view.state.doc.lineAt(pos);
        const matches = getImageMatches(line.text);
        if (matches.length === 0) {
            e.preventDefault();
            return;
        }

        // Live Preview 用 widget 替换了图片语法对应的源码区间，posAtDOM 返回的正是该区间的
        // 起点；用「落在 [start, end) 内」定位这是当前行第几张图片，同一行写了多张图片时
        // 也能精确区分具体拖的是哪一张——而不是像过去那样，只要同行有其他内容/图片就整体
        // 禁止拖拽。
        const offsetInLine = pos - line.from;
        let matchIndex = matches.findIndex(m => offsetInLine >= m.start && offsetInLine < m.end);
        if (matchIndex === -1) matchIndex = matches.length - 1;

        const sourcePath = getFilePathForNode(plugin, img);
        if (!sourcePath) {
            e.preventDefault();
            return;
        }

        setCurrentDrag({
            sourcePath,
            lineIndex: line.number - 1,
            matchIndex,
            markdown: matches[matchIndex].text,
        });
        e.dataTransfer?.setData(STANDALONE_IMAGE_DRAG_MIME, "1");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    // currentDrag 本身的清空由 drag-state.ts 的 registerDragStateLifecycle 统一兜底，
    // 这里的 dragend 只需处理自己引入的 DOM 残留。
    plugin.registerDomEvent(activeDocument, "dragend", () => {
        // 兜底清理：正常情况下容器的 dragleave/drop 会自己摘掉高亮，
        // 这里防止极端情况下（比如拖拽被系统中途取消）残留高亮效果
        activeDocument.querySelectorAll(".plugin-image-container--drag-target").forEach(node => {
            node.classList.remove("plugin-image-container--drag-target");
        });
    });
}
