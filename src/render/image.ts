import { SettingOptions } from "../core/domain";
import { setCssProps } from "../core/dom";
import { openImagePreview } from "./preview";

/**
 * 创建图片组中的单个图片元素，并应用对应的配置。
 * 点击（桌面端）或轻触（移动端）时打开大图预览。
 *
 * @param option - 配置对象
 * @param src - 图片源
 * @param srcList - 图片列表
 * @param idx - 图片索引
 * @returns 图片元素
 */
export function createImage(option: SettingOptions, src: string, srcList?: string[], idx?: number): HTMLImageElement {
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

    const openOverlay = () => openImagePreview(src, srcList, idx);

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

    return img;
}
