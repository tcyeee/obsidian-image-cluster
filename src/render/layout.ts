import { SettingOptions } from "../core/domain";
import { setCssProps } from "../core/dom";
import { config } from "../core/config";

// 关联每个图片容器与其设置面板中的 limit 复选框，供蒙版点击时直接同步 UI 状态
export const containerLimitCheckboxMap = new WeakMap<HTMLDivElement, HTMLInputElement>();

/**
 * 获取当前缩略图对应的外层 wrapper（如果存在且为本插件创建的 wrapper）。
 */
function getImageWrapper(img: HTMLImageElement): HTMLElement | null {
    const parent = img.parentElement;
    if (!parent) return null;
    return parent.classList.contains("plugin-image-wrapper") ? parent : null;
}

/**
 * 同步尺寸 & 圆角到图片及其外层 wrapper。
 */
function applySizeAndRadius(
    img: HTMLImageElement,
    wrapper: HTMLElement | null,
    option: SettingOptions,
): void {
    setCssProps(img, {
        "--plugin-image-size": `${option.size}px`,
        "--plugin-image-radius": `${option.radius}px`,
    });
    if (wrapper) {
        setCssProps(wrapper, {
            "--plugin-image-size": `${option.size}px`,
            "--plugin-image-radius": `${option.radius}px`,
        });
    }
}

/**
 * 将某个视觉样式类（阴影/边框/隐藏）优先作用到 wrapper，
 * 若不存在 wrapper，则退回到直接作用在图片上。
 */
function applyWrapperPreferredClass(
    img: HTMLImageElement,
    wrapper: HTMLElement | null,
    className: string,
    enabled: boolean,
): void {
    const target = wrapper ?? img;
    if (enabled) {
        target.classList.add(className);
        // 保证 class 只挂在一个元素上，避免样式叠加
        if (wrapper && target === wrapper) {
            img.classList.remove(className);
        } else if (wrapper && target === img) {
            wrapper.classList.remove(className);
        }
    } else {
        target.classList.remove(className);
        wrapper?.classList.remove(className);
        img.classList.remove(className);
    }
}

/**
 * 将 SettingOptions 应用到某个容器中的所有图片与容器本身。
 * 这样 parseStyleOptions + 设置面板 就形成了统一的数据源。
 *
 * @param container - 图片容器
 * @param option - 配置对象
 * @param onLimitTogglePersist - 当 limit 状态被代码触发变更时（例如点击「+N」蒙版取消限制）
 *                               需要立刻持久化配置行时调用的回调（可选）
 */
export function applySettingsToContainer(container: HTMLDivElement, option: SettingOptions, onLimitTogglePersist?: () => void) {
    setCssProps(container, { "--plugin-container-gap": `${option.gap}px` });

    // 这里只处理图片组中的缩略图，不包含大图预览；大图预览始终保持原图样式
    const imgs = Array.from(container.querySelectorAll<HTMLImageElement>(".plugin-image"));
    imgs.forEach((img) => {
        const wrapper = getImageWrapper(img);

        // 尺寸 & 圆角（同时作用于图片与外层 wrapper，保证布局和裁剪一致）
        applySizeAndRadius(img, wrapper, option);

        // 阴影 / 边框 / 隐藏：统一用「优先 wrapper」的策略，封装成小工具函数
        applyWrapperPreferredClass(img, wrapper, "plugin-image-shadow", option.shadow);
        applyWrapperPreferredClass(img, wrapper, "plugin-image-border", option.border);
        applyWrapperPreferredClass(img, wrapper, "plugin-image-hidden", option.hidden);
    });

    // 根据 limit 选项，决定是否只显示前三行图片
    applyLimitRows(container, option, onLimitTogglePersist);
}

/**
 * 根据当前容器的宽度 / 图片宽度 / gap，仅保留前三行图片。
 * 当 option.limit 为 false 时，恢复所有被隐藏的元素。
 *
 * 由于初次渲染时 container 还未插入文档，这里用 requestAnimationFrame
 * 等待浏览器完成布局后，再根据「容器宽度 / (图片宽度 + gap)」计算每行可容纳数量。
 *
 * 限制开启时：
 * - 最多显示 3 行
 * - 若还有剩余图片，则最后一张显示为「+N」的灰色蒙版，点击后等同于关闭 limit。
 */
function applyLimitRows(container: HTMLDivElement, option: SettingOptions, onLimitTogglePersist?: () => void): void {
    if (!option.limit) {
        // 关闭限制：立刻恢复所有元素显示
        const allItems = Array.from(
            container.querySelectorAll<HTMLElement>(".plugin-image-wrapper, .plugin-image-error"),
        );
        allItems.forEach((el) => {
            el.classList.remove("plugin-image-row-hidden");
            const mask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
            if (mask) mask.remove();
            el.classList.remove("plugin-image-more-wrapper");
        });
        return;
    }

    // 开启限制：等待一帧，让浏览器先完成布局，再根据 offsetTop 实际分行。
    // 如果此时容器宽度为 0（例如笔记面板还在布局中），使用 LIMIT_DELAY / LIMIT_MAX_RETRY 做有限次重试，
    // 避免「首次打开页面时不生效，只有手动再勾一次 limit 才生效」的问题。
    let retryCount = 0;

    const runLimit = () => {
        const items = Array.from(
            container.querySelectorAll<HTMLElement>(".plugin-image-wrapper, .plugin-image-error"),
        );
        if (items.length === 0) return;

        // 如果容器还没有正确布局（宽度为 0），稍后重试一次
        if (container.offsetWidth === 0 && retryCount < config.LIMIT_MAX_RETRY) {
            retryCount++;
            window.setTimeout(runLimit, config.LIMIT_DELAY);
            return;
        }

        /**
         * 使用 offsetTop 实际分行：
         * - 遍历所有元素，按 offsetTop 变化分成多行
         * - 前 MAX_VISIBLE_ROWS 行保留，其余行隐藏
         * - 最后一格替换为 "+N" 蒙版
         */
        const rows: HTMLElement[][] = [];
        let currentTop: number | null = null;

        for (const el of items) {
            const top = el.offsetTop;
            if (currentTop === null || Math.abs(top - currentTop) > 1) {
                currentTop = top;
                rows.push([]);
            }
            rows[rows.length - 1].push(el);
        }

        const maxRows = config.MAX_VISIBLE_ROWS;

        // 不足 maxRows 行：全部显示，不加蒙版
        if (rows.length <= maxRows) {
            items.forEach((el) => {
                // 恢复正常显示状态：移除「隐藏行」和蒙版相关的样式
                el.classList.remove("plugin-image-row-hidden");
                const oldMask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
                if (oldMask) oldMask.remove();
                el.classList.remove("plugin-image-more-wrapper");
            });
            return;
        }

        // 预清理：移除之前的蒙版
        items.forEach((el) => {
            const oldMask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
            if (oldMask) oldMask.remove();
            el.classList.remove("plugin-image-more-wrapper");
            el.classList.remove("plugin-image-row-hidden");
        });

        // 前 maxRows 行中的最后一个元素作为 "+N" 容器
        const visibleRows = rows.slice(0, maxRows);
        const flattenedVisible = visibleRows.flat();
        const overlayEl = flattenedVisible[flattenedVisible.length - 1];

        // 0 ~ (flattenedVisible.length - 2) 是真实显示的原图
        const visibleOriginalSet = new Set(flattenedVisible.slice(0, -1));

        const totalCount = items.length;
        const visibleOriginalCount = visibleOriginalSet.size;
        const remainingCount = totalCount - visibleOriginalCount;

        items.forEach((el) => {
            if (visibleOriginalSet.has(el)) {
                // 在前三行内、且不是最后一个格子的原图
                el.classList.remove("plugin-image-row-hidden");
            } else if (el === overlayEl) {
                // 带 "+N" 的蒙版图片
                el.classList.remove("plugin-image-row-hidden");
                el.classList.add("plugin-image-more-wrapper");

                const mask = createDiv({ cls: "plugin-image-more-mask" });
                const text = createSpan({ cls: "plugin-image-more-text", text: `+ ${remainingCount}` });
                mask.appendChild(text);

                // 点击蒙版：关闭 limit，同步 UI 复选框，并持久化。
                // 注意：setting panel 挂在 document.body 而非 container 内，
                // 因此通过 WeakMap 直接拿到 limitCheckbox 引用来同步状态，
                // 而不是用 container.querySelector（那样永远找不到）。
                mask.addEventListener("click", (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    option.limit = false;
                    // 同步设置面板中的复选框 UI
                    const limitCheckbox = containerLimitCheckboxMap.get(container);
                    if (limitCheckbox) limitCheckbox.checked = false;
                    // 重新应用配置，移除蒙版、显示所有图片
                    applySettingsToContainer(container, option);
                    if (onLimitTogglePersist) onLimitTogglePersist();
                });

                el.appendChild(mask);
            } else {
                // 超出前三行 + 1 个蒙版的全部隐藏：通过 CSS class 控制 display
                el.classList.add("plugin-image-row-hidden");
            }
        });
    };

    // 首次调用仍然放在 requestAnimationFrame 中，避免同步强制布局
    window.requestAnimationFrame(runLimit);
}
