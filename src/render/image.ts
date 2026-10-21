import { MarkdownPostProcessorContext, TFile, setIcon } from "obsidian";
import ImgRowPlugin from "main";
import { PreviewItem, SettingOptions } from "../core/domain";
import { setCssProps } from "../core/dom";
import { openImagePreview } from "./preview";
import { openImageContextMenu } from "./image-context-menu";

interface ImageContextMenuData {
    plugin: ImgRowPlugin;
    file: TFile;
    wrapper: HTMLElement;
    container: HTMLDivElement;
    ctx: MarkdownPostProcessorContext;
    el: HTMLElement;
    option: SettingOptions;
    isVideo: boolean;
}

// 每张图片对应的右键菜单上下文，用 window 级捕获监听统一查表触发（见下方说明）。
const imageContextMenuData = new WeakMap<HTMLImageElement, ImageContextMenuData>();
// 同一个 window（含弹出窗口各自的 window）只挂一次捕获监听，避免每张图片重复注册。
const contextMenuCaptureInstalled = new WeakSet<Window>();

/**
 * Obsidian 近期版本会在 document（或更内层的祖先节点，比如 .markdown-preview-sizer）
 * 上挂一个更早的 contextmenu 捕获阶段监听，用来弹出它自己的"用默认应用打开 / 在系统访达
 * 中显示"原生风格菜单——这个监听读的是触发事件的 <img> 自身的 src（此时是缩略图缓存路径）。
 *
 * 实测过把拦截点放在 document 捕获阶段：虽然我们自己的菜单能正常弹出了，但 Obsidian 那层
 * 监听先于我们执行（同一个 document 上，谁先注册谁先跑，它是核心代码，必然比插件先注册），
 * 导致它的菜单已经同步创建完毕，我们之后再调用 stopPropagation 也无法撤销——于是两个菜单
 * 同时出现、重叠在一起。
 *
 * capture 阶段的顺序是按节点在 DOM 树里的深度决定的，而不是按监听器的注册时间：
 * window 的捕获阶段必然先于 document（以及更深的任何祖先节点）执行，和谁先注册无关。
 * 把拦截点继续上移到 window 这一级，就能保证我们先于 Obsidian 那层监听拿到事件，
 * 从而真正在它的菜单被创建之前 stopPropagation，避免重叠。
 */
function handleCaptureContextMenu(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    const data = imageContextMenuData.get(target);
    if (!data) return;
    e.preventDefault();
    e.stopPropagation();
    openImageContextMenu(e.clientX, e.clientY, data.plugin, data.file, data.wrapper, data.container, data.ctx, data.el, data.option, data.isVideo);
}

function ensureContextMenuCapture(win: Window): void {
    if (contextMenuCaptureInstalled.has(win)) return;
    contextMenuCaptureInstalled.add(win);
    win.addEventListener("contextmenu", handleCaptureContextMenu, { capture: true });
}

/**
 * 创建图片组中的单个图片元素，并应用对应的配置。
 * 点击（桌面端）或轻触（移动端）时打开大图预览。
 *
 * @param option - 配置对象
 * @param src - 图片源
 * @param plugin - 插件实例，右键菜单里「用默认应用打开」等操作需要
 * @param file - 该图片对应的原图文件，右键菜单操作的目标
 * @param wrapper - 该图片所在的 .plugin-image-wrapper，右键菜单里「排除/删除」操作需要
 * @param container - 图片组容器，右键菜单里「排除/删除」操作持久化时需要
 * @param ctx - Markdown 代码块处理上下文，右键菜单里「排除/删除」操作持久化时需要
 * @param el - 代码块渲染根节点，右键菜单里「排除/删除」操作持久化时需要
 * @param srcList - 预览列表（图片/视频混合）
 * @param idx - 当前项在 srcList 中的索引
 * @param isVideo - 该项是否为视频（视频显示封面帧缩略图 + 播放角标，点击后在预览中播放）
 * @returns 图片元素（视频同样以封面帧缩略图的形式展示在组内，真正的播放发生在大图预览里）
 */
export function createImage(
    option: SettingOptions,
    src: string,
    plugin: ImgRowPlugin,
    file: TFile,
    wrapper: HTMLElement,
    container: HTMLDivElement,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    srcList?: PreviewItem[],
    idx?: number,
    isVideo = false,
): HTMLImageElement {
    const img = createEl("img");
    img.src = src;
    img.classList.add("plugin-image");
    // 禁用 <img> 自身的原生拖拽：否则浏览器会以 img.src（此时是缩略图缓存路径）
    // 自动生成一份原生拖拽数据，与 wrapper 上的自定义拖拽逻辑（drag-sort.ts）叠加，
    // 导致拖出图片组时写入的是缓存缩略图而不是原图。禁用后拖拽只由 wrapper 的
    // draggable 触发，只携带我们自己设置的数据。
    img.draggable = false;
    setCssProps(img, {
        "--plugin-image-size": `${option.size}px`,
        "--plugin-image-radius": `${option.radius}px`,
    });

    const openOverlay = () => openImagePreview({ src, isVideo }, srcList, idx);

    // 桌面端：鼠标点击打开预览
    // preventDefault 是必须的：Obsidian 1.13 起，阅读模式给 .markdown-preview-sizer
    // 挂了一个委托监听（"click" on "img,video"），会把 section 里所有 <img> 收集成图集、
    // 用 img.src（此时是缩略图缓存路径）打开原生 Lightbox。该监听首行即 `if (defaultPrevented) return`，
    // 因此这里必须调用 preventDefault，否则原生 Lightbox 会在我们的 overlay 底下再叠一层低清预览，
    // 关闭我们的 overlay 后就露出那层缩略图。移动端的 touchend 分支已有同等处理。
    img.addEventListener("click", e => {
        e.preventDefault();
        openOverlay();
    });
    // 移动端：touchend 打开预览
    // 记录 touchstart 坐标，在 touchend 时判断位移是否超过阈值：
    // 超过则认为是滑动手势，不打开预览，避免页面滚动时误触图片。
    let touchStartX = 0;
    let touchStartY = 0;
    img.addEventListener("touchstart", e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    img.addEventListener("touchend", e => {
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dx > 10 || dy > 10) return; // 位移过大，判定为滑动，忽略
        e.stopPropagation();
        e.preventDefault();
        openOverlay();
    }, { passive: false });

    // 右键：拦截原生菜单（此前指向缩略图缓存文件），改用自定义菜单。
    // 实际拦截点在 window 捕获阶段（见 handleCaptureContextMenu 注释），这里只登记
    // 这张图片对应的菜单上下文，并确保所在 window（支持弹出窗口）已经挂上捕获监听。
    imageContextMenuData.set(img, { plugin, file, wrapper, container, ctx, el, option, isVideo });
    const win = img.ownerDocument.defaultView;
    if (win) ensureContextMenuCapture(win);

    // 视频缩略图是封面静帧，加一个居中的播放角标提示"这其实是一段视频"。
    if (isVideo) {
        const badge = createDiv({ cls: "plugin-video-play-badge" });
        badge.setAttribute("aria-hidden", "true");
        setIcon(badge, "play");
        wrapper.appendChild(badge);
    }

    return img;
}
