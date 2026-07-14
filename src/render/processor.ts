import ImgRowPlugin from "main";
import { TFile, normalizePath } from "obsidian";
import { config } from "../core/config";
import { parseStyleOptions } from "../markdown/style-options";
import { persistOptionsToSource } from "../markdown/persistence";
import { md5 } from "../thumbnail/md5";
import { ensureThumbnailForFile } from "../thumbnail/thumbnail";
import { createErrorDiv } from "./elements";
import { createImage } from "./image";
import { createContainer } from "./container";
import { applySettingsToContainer } from "./layout";
import { enableDragSort } from "./drag-sort";
import { attachImageWrapperActions } from "./image-actions";
import { getImagePathMatches } from "../markdown/image-syntax";

// el -> 这个 el 上最近一次调用本处理器时创建的 container。
// 如果同一个 el 在其 requestAnimationFrame 回调触发前又被重新渲染了一次
// （el.empty() 清空、创建了新的 container），旧的 rAF 回调不应该再去操作
// 已经过期的 container——否则可能把过期渲染里的 settingWrapper 插回 codeBlock、
// 把 enableDragSort 的监听器绑到一个已经从 el 摘除的 container 上。
const latestContainerByEl = new WeakMap<HTMLElement, HTMLDivElement>();

/**
 * 自动解析imgs代码块
 * 当解析到imgs代码块时，会自动创建一个图片容器，并应用对应的配置。
 */
export function addImageLayoutMarkdownProcessor(plugin: ImgRowPlugin) {
    plugin.registerMarkdownCodeBlockProcessor("imgs", (source, el, ctx) => {
        // Live Preview 下同一个代码块的 el 可能被 Obsidian 复用、多次调用本回调
        // （例如本插件自身通过 vault.modify 改写源码触发的重渲染）。
        // 不先清空的话，旧的 container（连同其上的拖拽/排序事件监听器）会残留在 el 里，
        // 与新渲染出的 container 同时存在，导致同一次拖拽被多套监听器重复处理
        // （表现为拖入的图片被重复插入、源图片所在行也可能被错误地保留下来）。
        el.empty();

        const option = parseStyleOptions(source);
        const container = createContainer(option, plugin, ctx, el);
        latestContainerByEl.set(el, container);

        const lines = source.split("\n");
        // 用于大图预览的原图地址列表
        const srcList: string[] = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            // 同时支持标准 Markdown 格式 ![alt](path) 和 Obsidian 内部链接 ![[path]]。
            // 一行正常情况下只会有一张图片，但手动编辑可能把多张图片写在同一行——
            // 逐个解析全部匹配项，而不是只取第一个，避免同行的第二张及之后的图片
            // 被静默丢弃、既不显示也不参与拖拽排序。
            const imageMatches = getImagePathMatches(trimmedLine);

            imageMatches.forEach(({ text, rawPath }) => {
                // rawPath 可能本身就不是合法的百分号编码（例如文件名里正好带有裸的 "%"，
                // 如 "50% off.png"）：decodeURIComponent 会直接抛 URIError。
                // 这里之前没有捕获，会导致异常从循环中间冒出，整个 imgs 代码块
                // 连同已经处理完的图片一起渲染失败（container 永远不会被 appendChild）。
                // 解码失败时按原文使用 rawPath 本身兜底，而不是让一行坏路径拖垮整组。
                let decodedPath: string;
                try {
                    decodedPath = decodeURIComponent(rawPath);
                } catch {
                    decodedPath = rawPath;
                }
                const abstractFile = plugin.app.vault.getAbstractFileByPath(decodedPath);
                const file =
                    plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, ctx.sourcePath) ??
                    (abstractFile instanceof TFile ? abstractFile : null);

                const wrapper = createDiv({ cls: "plugin-image-wrapper" });
                // 一行只有一张图片时，保存整行原文（可能还带列表标记等其他文本）；
                // 一行写了多张图片这种少见的手动编辑场景，则每张图片各自一个 wrapper，
                // 只保存这一张自身的语法文本——与拖拽排序/排除/删除/拖出等持久化逻辑
                // 默认的「一个 wrapper 对应一行」模型保持一致，代价是该行若还有其他
                // 非图片文本，会在下一次触发持久化时被丢弃（可接受：正常操作永远不会
                // 产生这种同行多图的情况，只有手动编辑才会触发）。
                wrapper.dataset.imgLine = imageMatches.length === 1 ? trimmedLine : text;

                if (file) {
                    // 原图 resource 路径（用于点击后的大图预览）
                    const originalSrc = plugin.app.vault.getResourcePath(file);
                    const imgIdx = srcList.length;
                    srcList.push(originalSrc);

                    // 缩略图路径（相对于 vault 根目录）
                    // 使用源文件路径的 MD5 作为文件名，且不带扩展名：
                    // <THUMBNAIL_PATH>/<md5(file.path)>
                    // 例如：THUMBNAIL_PATH="assets/cache/"，原图为 "assets/1.png"
                    // 最终缩略图写入路径为 "assets/cache/<md5>"
                    const thumbKey = md5(file.path);
                    const thumbPath = normalizePath(`${config.THUMBNAIL_PATH}${thumbKey}`);
                    // 缩略图文件对象

                    const thumbFile = plugin.app.vault.getAbstractFileByPath(thumbPath);
                    // 缩略图资源路径
                    const thumbSrc = thumbFile instanceof TFile
                        ? plugin.app.vault.getResourcePath(thumbFile)
                        : originalSrc;

                    // 列表中展示缩略图，点击后仍然使用 srcList 中的原图
                    const imgEl = createImage(option, thumbSrc, srcList, imgIdx);
                    wrapper.appendChild(imgEl);
                    container.appendChild(wrapper);
                    // 悬停时出现的「排除 / 删除」按钮
                    attachImageWrapperActions(wrapper, file, container, plugin, ctx, el);

                    // 如果当前还没有缩略图，则在后台异步生成一份，并在生成后刷新当前 img 的 src
                    if (!(thumbFile instanceof TFile)) {
                        void ensureThumbnailForFile(plugin, file, thumbPath, imgEl);
                    }
                } else {
                    // 如果图片不存在，则在对应位置插入错误图标。
                    // 同样包裹进 .plugin-image-wrapper（而不是直接挂在 container 下）：
                    // 否则这一行会因为查询不到 wrappers 而在下一次拖拽排序/排除/插入
                    // 触发的持久化中被静默从文件里删除——即便用户根本没碰过这张坏图片。
                    wrapper.appendChild(createErrorDiv(option));
                    container.appendChild(wrapper);
                }
            });
        }
        // 先挂载到文档，再应用配置（包括 limit 逻辑），避免初次渲染时拿不到正确宽度
        el.appendChild(container);
        // 将当前配置应用到容器中的所有图片（支持后续面板动态更新）
        // 这里传入一个简单的「立即持久化」回调，供后续点击「+N」蒙版时使用：
        // 当用户通过点击蒙版关闭 limit 限制时，会调用该回调把最新配置写回到代码块配置行。
        applySettingsToContainer(container, option, () => {
            void persistOptionsToSource(option, plugin, ctx, el);
        });

        // 编辑模式（Live Preview）：el 在处理器回调时尚未挂入 DOM，
        // 用 requestAnimationFrame 等待挂载完成后，再将 setting wrapper 移入
        // .cm-preview-code-block，放在原生 edit-block-button 的左侧。
        window.requestAnimationFrame(() => {
            // 这一帧触发前，el 又被重新渲染过一次：本次 container 已经过期，整段跳过，
            // 避免把过期渲染的 settingWrapper/拖拽监听器接到已经摘除的 container 上。
            if (latestContainerByEl.get(el) !== container) return;

            const codeBlock = el.closest('.cm-preview-code-block');
            const settingWrapper = container.querySelector<HTMLElement>('.plugin-image-setting-outer');
            if (codeBlock && settingWrapper) {
                // settingWrapper 会被移出 el、挂到 codeBlock 上，因此不受上面 el.empty() 的清理范围覆盖；
                // 若同一个 codeBlock 此前已经挂过一份（例如本次是重渲染），需要先移除旧的，避免重复堆叠。
                codeBlock.querySelectorAll('.plugin-image-setting-outer').forEach((old) => {
                    if (old !== settingWrapper) old.remove();
                });
                const editBtn = codeBlock.querySelector('.edit-block-button');
                if (editBtn) {
                    codeBlock.insertBefore(settingWrapper, editBtn);
                } else {
                    codeBlock.appendChild(settingWrapper);
                }
                // 编辑模式下启用图片拖拽排序
                enableDragSort(container, plugin, ctx, el);
            } else if (settingWrapper) {
                // 阅读模式（非 Live Preview）：不展示操作按钮，直接移除 setting wrapper
                settingWrapper.remove();
            }
        });
    });
}
