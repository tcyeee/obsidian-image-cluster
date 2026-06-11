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
    setCssProps(img, {
        "--plugin-image-size": `${option.size}px`,
        "--plugin-image-radius": `${option.radius}px`,
    });

    const openOverlay = () => openImagePreview(src, srcList, idx);

    // 桌面端：鼠标点击打开预览
    img.addEventListener("click", openOverlay);
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
