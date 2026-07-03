import ImgRowPlugin from "main";
import { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { isSingleImageLine } from "./markdown/image-syntax";
import { STANDALONE_IMAGE_DRAG_MIME, setCurrentDrag, clearCurrentDrag } from "./drag-state";

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
    const isEligibleImage = (target: EventTarget | null): target is HTMLImageElement => {
        if (!(target instanceof HTMLImageElement)) return false;
        if (!target.closest(".cm-content")) return false; // 仅 Live Preview
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    plugin.registerDomEvent(document, "dragstart", (e: DragEvent) => {
        if (!plugin.settings.enableDragToGroup) return;
        if (!isEligibleImage(e.target)) return;
        const img = e.target;

        const editorRoot = img.closest(".cm-editor") as HTMLElement | null;
        const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
        if (!view) return;

        const pos = view.posAtDOM(img);
        const line = view.state.doc.lineAt(pos);
        if (!isSingleImageLine(line.text)) {
            // 同一行还有其他图片或正文内容，整行删除不安全，取消这次拖拽
            e.preventDefault();
            return;
        }

        const sourcePath = getFilePathForNode(plugin, img);
        if (!sourcePath) {
            e.preventDefault();
            return;
        }

        setCurrentDrag({ sourcePath, lineIndex: line.number - 1, markdown: line.text });
        e.dataTransfer?.setData(STANDALONE_IMAGE_DRAG_MIME, "1");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    plugin.registerDomEvent(document, "dragend", () => {
        clearCurrentDrag();
        // 兜底清理：正常情况下容器的 dragleave/drop 会自己摘掉高亮，
        // 这里防止极端情况下（比如拖拽被系统中途取消）残留高亮效果
        document.querySelectorAll(".plugin-image-container--drag-target").forEach(node => {
            node.classList.remove("plugin-image-container--drag-target");
        });
    });
}
