import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext } from "obsidian";
import { persistReorderToSource, persistDragInsertToSource } from "../markdown/persistence";
import { STANDALONE_IMAGE_DRAG_MIME, getCurrentDrag } from "../drag-state";

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
            const isExternalImageDrag = !!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME);
            if (!dragSrcEl && !isExternalImageDrag) return; // 既不是组内重排，也不是本插件发起的图片拖拽，交给浏览器默认行为
            e.preventDefault();
            if (dragSrcEl === wrapper) return;
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
            const isExternalImageDrag = !!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME);
            if (!dragSrcEl && !isExternalImageDrag) return;
            e.preventDefault();
            const insertBefore = e.clientX < wrapper.getBoundingClientRect().left + wrapper.getBoundingClientRect().width / 2;
            clearIndicators();

            if (dragSrcEl) {
                // 组内重排：拖拽源就是本容器中的某个 wrapper
                if (dragSrcEl === wrapper) return;
                container.insertBefore(dragSrcEl, insertBefore ? wrapper : wrapper.nextSibling);
                void persistReorderToSource(container, plugin, ctx, el);
                return;
            }

            // 独立图片拖入本图片组
            const drag = getCurrentDrag();
            if (!drag) return;
            const tempWrapper = createDiv({ cls: "plugin-image-wrapper" });
            tempWrapper.dataset.imgLine = drag.markdown;
            container.insertBefore(tempWrapper, insertBefore ? wrapper : wrapper.nextSibling);
            void persistDragInsertToSource(container, plugin, ctx, el, drag.sourcePath, drag.lineIndex);
        });
    });
}
