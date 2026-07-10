import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext, TFile, normalizePath, setIcon } from "obsidian";
import { config } from "../core/config";
import { md5 } from "../thumbnail/md5";
import { persistExcludeImageToSource, persistRemoveImageFromSource } from "../markdown/persistence";
import { ConfirmDeleteImageModal } from "./confirm-delete-modal";

/**
 * 统计 vault 中所有指向 file 的链接/嵌入总数（含当前这一处引用）。
 * 用于删除前判断「是否被其他地方引用」。
 */
function countVaultReferences(plugin: ImgRowPlugin, file: TFile): number {
    const resolvedLinks = plugin.app.metadataCache.resolvedLinks;
    let total = 0;
    for (const sourcePath in resolvedLinks) {
        total += resolvedLinks[sourcePath]?.[file.path] ?? 0;
    }
    return total;
}

/** 排除：把图片移出图片组，重新以独立图片行的形式放到组正下方（缓存与原图不受影响）。 */
function excludeImageBelowGroup(
    wrapper: HTMLElement,
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    const imgLine = wrapper.dataset.imgLine ?? "";
    wrapper.remove();
    void persistExcludeImageToSource(container, plugin, ctx, el, imgLine);
}

/** 删除：原图已被移除，图片组内不能再保留指向它的这一行，直接从组内摘除（不回填到组下方）。 */
function removeImageFromGroup(
    wrapper: HTMLElement,
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    wrapper.remove();
    void persistRemoveImageFromSource(container, plugin, ctx, el);
}

/** 删除缓存缩略图与原图文件（走系统/Obsidian 回收站，而非直接抹除，与核心「删除文件」命令保持一致）。 */
async function deleteImageFile(plugin: ImgRowPlugin, file: TFile): Promise<void> {
    const thumbKey = md5(file.path);
    const thumbPath = normalizePath(`${config.THUMBNAIL_PATH}${thumbKey}`);
    const thumbFile = plugin.app.vault.getAbstractFileByPath(thumbPath);
    if (thumbFile instanceof TFile) {
        await plugin.app.fileManager.trashFile(thumbFile);
    }
    await plugin.app.fileManager.trashFile(file);
}

/**
 * 给图片组中的单张图片挂载 hover 时出现的暗化蒙层，以及「排除」「删除」按钮。
 *
 * - 排除：把这张图片从当前图片组中移出，重新作为一行独立图片放到图片组下方
 *   （上下各留一行空行），缓存缩略图与原图文件保持不变。
 * - 删除：先检测该原图是否还被 vault 中其他地方引用；
 *   未被引用则直接删除（连同缓存缩略图与原图一并移入回收站）；
 *   被引用则弹窗提醒，用户可以选择仍然删除原图，或改为仅从组中移除（等同排除）。
 */
export function attachImageWrapperActions(
    wrapper: HTMLElement,
    file: TFile,
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    const overlay = createDiv({ cls: "plugin-image-item-overlay" });
    wrapper.appendChild(overlay);

    const actions = createDiv({ cls: "plugin-image-item-actions" });

    const excludeBtn = createDiv({ cls: "plugin-image-item-action-btn clickable-icon" });
    excludeBtn.setAttribute("aria-label", "Remove from group");
    setIcon(excludeBtn, "circle-minus");
    excludeBtn.addEventListener("mousedown", e => e.stopPropagation());
    excludeBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        excludeImageBelowGroup(wrapper, container, plugin, ctx, el);
    });

    const deleteBtn = createDiv({ cls: "plugin-image-item-action-btn plugin-image-item-action-btn--danger clickable-icon" });
    deleteBtn.setAttribute("aria-label", "Delete image");
    setIcon(deleteBtn, "trash-2");
    deleteBtn.addEventListener("mousedown", e => e.stopPropagation());
    deleteBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        const otherRefCount = Math.max(0, countVaultReferences(plugin, file) - 1);

        if (otherRefCount === 0) {
            // 没有被其他地方引用：直接删除，无需弹窗确认
            void (async () => {
                await deleteImageFile(plugin, file);
                removeImageFromGroup(wrapper, container, plugin, ctx, el);
            })();
            return;
        }

        new ConfirmDeleteImageModal(plugin.app, otherRefCount, (deleteOriginal) => {
            void (async () => {
                if (deleteOriginal) {
                    await deleteImageFile(plugin, file);
                    removeImageFromGroup(wrapper, container, plugin, ctx, el);
                } else {
                    // 用户不同意删除原图：等同于排除，仅从组中移除
                    excludeImageBelowGroup(wrapper, container, plugin, ctx, el);
                }
            })();
        }).open();
    });

    actions.appendChild(excludeBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(actions);
}
