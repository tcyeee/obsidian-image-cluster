import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext } from "obsidian";
import { persistReorderToSource, persistDragInsertToSource } from "../markdown/persistence";
import { STANDALONE_IMAGE_DRAG_MIME, getCurrentDrag, GROUP_IMAGE_DRAG_MIME, setGroupDrag, clearGroupDrag } from "../drag-state";

/** 在同一行内找离鼠标最近的图片，判断插到它前面还是后面；鼠标不在任何行的高度范围内时返回 null（由调用方决定兜底为追加到末尾）。 */
function findRowInsertion(
    wrappers: HTMLElement[],
    clientX: number,
    clientY: number,
): { anchor: HTMLElement; before: boolean } | null {
    const sameRow = wrappers.filter(w => {
        const rect = w.getBoundingClientRect();
        return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (sameRow.length === 0) return null;

    let anchor = sameRow[0];
    let closestDist = Infinity;
    for (const w of sameRow) {
        const rect = w.getBoundingClientRect();
        const dist = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
        if (dist < closestDist) {
            closestDist = dist;
            anchor = w;
        }
    }
    const rect = anchor.getBoundingClientRect();
    return { anchor, before: clientX < rect.left + rect.width / 2 };
}

/**
 * 编辑模式下为图片容器添加拖拽排序功能。
 * 拖拽完成后自动将新顺序写回对应 Markdown 文件。
 * 同时支持把一张独立图片拖入本图片组（含容器高亮提示与空白区域兜底放置）。
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

    const insertExternalImage = (anchor: HTMLElement | null, before: boolean) => {
        const drag = getCurrentDrag();
        if (!drag) return;
        const tempWrapper = createDiv({ cls: "plugin-image-wrapper" });
        tempWrapper.dataset.imgLine = drag.markdown;
        if (anchor) {
            container.insertBefore(tempWrapper, before ? anchor : anchor.nextSibling);
        } else {
            container.appendChild(tempWrapper);
        }
        void persistDragInsertToSource(container, plugin, ctx, el, drag.sourcePath, drag.lineIndex);
    };

    // 容器级别：拖拽独立图片悬停时高亮整个图片组，提示这里可以放置
    container.addEventListener("dragenter", e => {
        if (!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME)) return;
        container.classList.add("plugin-image-container--drag-target");
    });
    container.addEventListener("dragleave", e => {
        const related = e.relatedTarget as Node | null;
        if (related && container.contains(related)) return; // 只是在子元素之间移动，仍在容器内
        container.classList.remove("plugin-image-container--drag-target");
    });

    // 容器级别兜底：鼠标落在空白处（没有正好压在某张图片上）时，按「同行最近图片」计算插入位置
    container.addEventListener("dragover", e => {
        if (!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const wrappers = getWrappers();
        if (wrappers.length === 0) return;
        clearIndicators();
        const match = findRowInsertion(wrappers, e.clientX, e.clientY);
        const anchor = match?.anchor ?? wrappers[wrappers.length - 1];
        const before = match?.before ?? false; // 不在任何行范围内：追加到最后一张图片之后
        anchor.classList.add(before ? "plugin-image-drag-before" : "plugin-image-drag-after");
    });

    container.addEventListener("drop", e => {
        if (!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME)) return;
        e.preventDefault();
        container.classList.remove("plugin-image-container--drag-target");
        clearIndicators();
        const wrappers = getWrappers();
        const match = wrappers.length > 0 ? findRowInsertion(wrappers, e.clientX, e.clientY) : null;
        insertExternalImage(match?.anchor ?? null, match?.before ?? false);
    });

    getWrappers().forEach(wrapper => {
        wrapper.draggable = true;
        wrapper.classList.add("plugin-image-sortable");

        wrapper.addEventListener("dragstart", e => {
            dragSrcEl = wrapper;
            wrapper.classList.add("plugin-image-dragging");
            e.dataTransfer?.setData("text/plain", "");
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";

            // 同时记录"拖出图片组"所需的状态，供 editor-drop-target.ts 在松手落到编辑器
            // 空白处时使用；组内重排（拖回本组）不受影响，因为那条路径只依赖上面的 dragSrcEl。
            if (plugin.settings.enableDragToGroup) {
                setGroupDrag({
                    sourcePath: ctx.sourcePath,
                    markdown: wrapper.dataset.imgLine ?? "",
                    container,
                    ctx,
                    el,
                    wrapper,
                });
                e.dataTransfer?.setData(GROUP_IMAGE_DRAG_MIME, "1");
            }
        });

        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("plugin-image-dragging");
            clearIndicators();
            dragSrcEl = null;
            clearGroupDrag();
        });

        wrapper.addEventListener("dragover", e => {
            const isExternalImageDrag = !!e.dataTransfer?.types.includes(STANDALONE_IMAGE_DRAG_MIME);
            if (!dragSrcEl && !isExternalImageDrag) return; // 既不是组内重排，也不是本插件发起的图片拖拽，交给浏览器默认行为
            e.preventDefault();
            e.stopPropagation(); // 已经在这里处理了，阻止再冒泡到容器级别的兜底逻辑重复处理
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
            e.stopPropagation(); // 阻止冒泡到容器级别的兜底 drop，避免重复插入
            container.classList.remove("plugin-image-container--drag-target");
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
            insertExternalImage(wrapper, insertBefore);
        });
    });
}
