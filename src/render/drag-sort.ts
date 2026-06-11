import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext } from "obsidian";
import { persistReorderToSource } from "../markdown/persistence";

/**
 * 编辑模式下为图片容器添加拖拽排序功能。
 * 拖拽完成后自动将新顺序写回对应 Markdown 文件。
 */
export function enableDragSort(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    let dragSrcEl: HTMLElement | null = null;

    const getWrappers = () =>
        Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"));

    const clearIndicators = () =>
        getWrappers().forEach(w => w.classList.remove("plugin-image-drag-before", "plugin-image-drag-after"));

    getWrappers().forEach(wrapper => {
        wrapper.draggable = true;
        wrapper.classList.add("plugin-image-sortable");

        wrapper.addEventListener("dragstart", e => {
            dragSrcEl = wrapper;
            wrapper.classList.add("plugin-image-dragging");
            e.dataTransfer?.setData("text/plain", "");
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        });

        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("plugin-image-dragging");
            clearIndicators();
            dragSrcEl = null;
        });

        wrapper.addEventListener("dragover", e => {
            e.preventDefault();
            if (!dragSrcEl || dragSrcEl === wrapper) return;
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            clearIndicators();
            const rect = wrapper.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                wrapper.classList.add("plugin-image-drag-before");
            } else {
                wrapper.classList.add("plugin-image-drag-after");
            }
        });

        wrapper.addEventListener("dragleave", () => {
            wrapper.classList.remove("plugin-image-drag-before", "plugin-image-drag-after");
        });

        wrapper.addEventListener("drop", e => {
            e.preventDefault();
            if (!dragSrcEl || dragSrcEl === wrapper) return;
            const rect = wrapper.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                container.insertBefore(dragSrcEl, wrapper);
            } else {
                container.insertBefore(dragSrcEl, wrapper.nextSibling);
            }
            clearIndicators();
            void persistReorderToSource(container, plugin, ctx, el);
        });
    });
}
