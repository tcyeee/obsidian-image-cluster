import { MarkdownPostProcessorContext, Notice, Platform, TFile, setIcon } from "obsidian";
import ImgRowPlugin from "main";
import { setCssProps } from "../core/dom";
import { confirmAndDeleteImage, excludeImageBelowGroup } from "./image-actions";

interface ContextMenuItemSpec {
    icon: string;
    label: string;
    onClick: () => void | Promise<void>;
    danger?: boolean;
    /** 在这一项之前插入分隔线，用于把「排除/删除」等结构性操作与上面的文件操作分组。 */
    separatorBefore?: boolean;
}

// app.openWithDefaultApp / app.showInFolder 是 Obsidian 桌面端的运行时方法，
// 未出现在官方类型声明（obsidian.d.ts）里——原生右键菜单里对应的「用默认应用打开」
// 「在访达中显示」就是调用这两个方法实现的，仅桌面端生效。
interface DesktopFileActions {
    openWithDefaultApp(path: string): Promise<void>;
    showInFolder(path: string): void;
}

const MIME_BY_EXTENSION: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
};

/**
 * 剪贴板 Clipboard API 的 write() 只保证支持 image/png：
 * 非 PNG 格式的图片需要先解码重绘到 canvas，再以 PNG 格式导出。
 */
async function toPngBlob(buffer: ArrayBuffer, mime: string): Promise<Blob> {
    if (mime === "image/png") return new Blob([buffer], { type: mime });

    const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
    const canvas = createEl("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("canvas.toBlob failed"));
        }, "image/png");
    });
}

async function copyImageToClipboard(plugin: ImgRowPlugin, file: TFile): Promise<void> {
    const buffer = await plugin.app.vault.readBinary(file);
    const mime = MIME_BY_EXTENSION[file.extension.toLowerCase()] ?? "image/png";
    const pngBlob = await toPngBlob(buffer, mime);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}

function buildMenuItems(
    plugin: ImgRowPlugin,
    file: TFile,
    wrapper: HTMLElement,
    container: HTMLDivElement,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): ContextMenuItemSpec[] {
    const items: ContextMenuItemSpec[] = [];

    // 「用默认应用打开」「在系统访达中显示」依赖桌面端文件系统，移动端不展示。
    if (Platform.isDesktopApp) {
        const app = plugin.app as unknown as typeof plugin.app & DesktopFileActions;
        items.push(
            { icon: "external-link", label: "Open in default app", onClick: () => app.openWithDefaultApp(file.path) },
            { icon: "folder-open", label: "Show in system explorer", onClick: () => app.showInFolder(file.path) },
        );
    }

    items.push({
        icon: "copy",
        label: "Copy image",
        onClick: async () => {
            try {
                await copyImageToClipboard(plugin, file);
            } catch (e: unknown) {
                new Notice("Copy image failed");
                console.error(e);
            }
        },
    });

    items.push(
        {
            icon: "circle-minus",
            label: "Remove from group",
            separatorBefore: true,
            onClick: () => excludeImageBelowGroup(wrapper, container, plugin, ctx, el),
        },
        {
            icon: "trash-2",
            label: "Delete image",
            danger: true,
            onClick: () => confirmAndDeleteImage(wrapper, file, container, plugin, ctx, el),
        },
    );

    return items;
}

// 同一时间最多一份菜单存活：打开新菜单前先关闭上一份。
let closeActiveMenu: (() => void) | null = null;

/**
 * 在指定视口坐标弹出图片的自定义右键菜单。
 * 设计语言与图片组的 setting 面板保持一致（圆角浮层 + 阴影 + 主背景色）。
 */
export function openImageContextMenu(
    x: number,
    y: number,
    plugin: ImgRowPlugin,
    file: TFile,
    wrapper: HTMLElement,
    container: HTMLDivElement,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    closeActiveMenu?.();

    const menu = createDiv({ cls: "plugin-image-context-menu" });
    buildMenuItems(plugin, file, wrapper, container, ctx, el).forEach(({ icon, label, onClick, danger, separatorBefore }) => {
        if (separatorBefore) {
            menu.appendChild(createDiv({ cls: "plugin-image-context-menu-separator" }));
        }
        const item = createDiv({ cls: "plugin-image-context-menu-item" });
        if (danger) item.addClass("plugin-image-context-menu-item--danger");
        const iconEl = createSpan({ cls: "plugin-image-context-menu-item-icon" });
        setIcon(iconEl, icon);
        const labelEl = createSpan({ cls: "plugin-image-context-menu-item-label", text: label });
        item.appendChild(iconEl);
        item.appendChild(labelEl);
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            close();
            void onClick();
        });
        menu.appendChild(item);
    });

    activeDocument.body.appendChild(menu);

    // 先挂载到 body 以获得真实尺寸，再夹紧到视口内，避免在屏幕边缘被裁切
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, activeWindow.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, activeWindow.innerHeight - rect.height - 8));
    setCssProps(menu, {
        "--plugin-context-menu-left": `${left}px`,
        "--plugin-context-menu-top": `${top}px`,
    });

    const abortCtrl = new AbortController();
    const close = () => {
        abortCtrl.abort();
        menu.remove();
        closeActiveMenu = null;
    };
    closeActiveMenu = close;

    activeDocument.addEventListener("mousedown", (e: MouseEvent) => {
        const target = e.targetNode;
        if (target && menu.contains(target)) return;
        close();
    }, { signal: abortCtrl.signal });
    activeDocument.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
    }, { signal: abortCtrl.signal });
    activeWindow.addEventListener("blur", close, { signal: abortCtrl.signal });
}
