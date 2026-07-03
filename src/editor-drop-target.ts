import ImgRowPlugin from "main";
import { EditorView } from "@codemirror/view";
import { GROUP_IMAGE_DRAG_MIME, getGroupDrag, clearGroupDrag } from "./drag-state";
import { persistDragOutToSource } from "./markdown/persistence";

const LINE_BEFORE_CLASS = "plugin-image-dragline-before";
const LINE_AFTER_CLASS = "plugin-image-dragline-after";

/**
 * 找到 clientX/clientY 命中的 CM6 行元素，以及应该插入在其"之前"还是"之后"。
 * 落点必须在某个 Live Preview 编辑器内，且不在任何图片组容器（.plugin-image-container）
 * 内部——落在图片组内部的情况已经由组内拖拽排序 / 拖入逻辑处理，这里不重复处理。
 */
function resolveLineTarget(
    clientX: number,
    clientY: number,
): { lineEl: HTMLElement; lineIndex: number; before: boolean } | null {
    const el = activeDocument.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el || el.closest(".plugin-image-container")) return null;

    const lineElement = el.closest(".cm-line") as HTMLElement | null;
    const editorRoot = el.closest(".cm-editor") as HTMLElement | null;
    if (!lineElement || !editorRoot) return null;

    const view = EditorView.findFromDOM(editorRoot);
    if (!view) return null;

    const pos = view.posAtDOM(lineElement);
    const line = view.state.doc.lineAt(pos);
    const rect = lineElement.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;

    return { lineEl: lineElement, lineIndex: line.number - 1, before };
}

function clearLineIndicators(): void {
    activeDocument.querySelectorAll(`.${LINE_BEFORE_CLASS}, .${LINE_AFTER_CLASS}`).forEach(node => {
        node.classList.remove(LINE_BEFORE_CLASS, LINE_AFTER_CLASS);
    });
}

/**
 * 把图片组内拖出的图片，在松手时插入到编辑器（Live Preview）中普通文本行的前/后，
 * 成为一行独立的 Markdown 图片；同时从原图片组中移除。
 */
export function registerEditorDropTarget(plugin: ImgRowPlugin): void {
    plugin.registerDomEvent(document, "dragover", (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes(GROUP_IMAGE_DRAG_MIME)) return;
        clearLineIndicators();
        const target = resolveLineTarget(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        target.lineEl.classList.add(target.before ? LINE_BEFORE_CLASS : LINE_AFTER_CLASS);
    });

    plugin.registerDomEvent(document, "drop", (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes(GROUP_IMAGE_DRAG_MIME)) return;
        e.preventDefault();
        clearLineIndicators();
        const groupDrag = getGroupDrag();
        const target = resolveLineTarget(e.clientX, e.clientY);
        clearGroupDrag();
        if (!groupDrag || !target) return;
        void persistDragOutToSource(groupDrag, plugin, target.lineIndex, target.before);
    });

    plugin.registerDomEvent(document, "dragend", () => {
        clearLineIndicators();
        clearGroupDrag();
    });
}
