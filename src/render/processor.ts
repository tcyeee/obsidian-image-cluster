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

/**
 * 自动解析imgs代码块
 * 当解析到imgs代码块时，会自动创建一个图片容器，并应用对应的配置。
 */
export function addImageLayoutMarkdownProcessor(plugin: ImgRowPlugin) {
    plugin.registerMarkdownCodeBlockProcessor("imgs", (source, el, ctx) => {
        const option = parseStyleOptions(source);
        const container = createContainer(option, plugin, ctx, el);

        const lines = source.split("\n");
        // 用于大图预览的原图地址列表
        const srcList: string[] = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            // 同时支持标准 Markdown 格式 ![alt](path) 和 Obsidian 内部链接 ![[path]]
            const mdMatch = /!\[.*?\]\((.*?)\)/.exec(trimmedLine);
            const wikiMatch = /!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/.exec(trimmedLine);
            const rawPath = mdMatch ? mdMatch[1] : wikiMatch ? wikiMatch[1].trim() : null;
            if (rawPath !== null) {
                const decodedPath = decodeURIComponent(rawPath);
                const abstractFile = plugin.app.vault.getAbstractFileByPath(decodedPath);
                const file =
                    plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, ctx.sourcePath) ??
                    (abstractFile instanceof TFile ? abstractFile : null);
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
                    const wrapper = createDiv({ cls: "plugin-image-wrapper" });
                    wrapper.dataset.imgLine = line.trim(); // 保存原始 markdown 行，供拖拽排序写回使用
                    wrapper.appendChild(imgEl);
                    container.appendChild(wrapper);

                    // 如果当前还没有缩略图，则在后台异步生成一份，并在生成后刷新当前 img 的 src
                    if (!(thumbFile instanceof TFile)) {
                        void ensureThumbnailForFile(plugin, file, thumbPath, imgEl);
                    }
                } else {
                    // 如果图片不存在，则在对应位置插入错误图标
                    container.appendChild(createErrorDiv(option));
                }
            }
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
            const codeBlock = el.closest('.cm-preview-code-block');
            const settingWrapper = container.querySelector<HTMLElement>('.plugin-image-setting-outer');
            if (codeBlock && settingWrapper) {
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
