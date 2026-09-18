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
    setCssProps(container, {
        "--plugin-container-gap": `${option.gap}px`,
        "--plugin-container-margin-left": `${option.paddingLeft > 0 ? option.paddingLeft : 0}px`,
    });

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

    // 网格模式：均匀方格由 CSS flex-wrap 负责排布，这里只需要处理"只显示前三行"的折叠。
    // 瀑布流模式：列位置与折叠都由 JS 显式计算（见 applyMasonryLayout），两者互斥。
    container.dataset.layout = option.layout;
    if (option.layout === "masonry") {
        applyMasonryLayout(container, option, onLimitTogglePersist);
    } else {
        applyLimitRows(container, option, onLimitTogglePersist);
    }
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

// 容器宽度变化（例如笔记面板被拖拽调整、分屏）时，需要重新计算瀑布流列位置——
// 与网格模式不同，瀑布流的坐标是 JS 显式算好写死的，不会随 CSS flex-wrap 自动重排。
// 用 WeakMap 保证同一个容器最多只挂一个 ResizeObserver，避免每次 applyMasonryLayout
// 调用都重复 observe 导致回调越叠越多。
const masonryResizeObservers = new WeakMap<HTMLDivElement, ResizeObserver>();

function ensureMasonryResizeObserver(
    container: HTMLDivElement,
    option: SettingOptions,
    onLimitTogglePersist?: () => void,
): void {
    if (masonryResizeObservers.has(container)) return;
    let lastWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {
        const width = container.clientWidth;
        if (width === lastWidth) return;
        lastWidth = width;
        applyMasonryLayout(container, option, onLimitTogglePersist);
    });
    observer.observe(container);
    masonryResizeObservers.set(container, observer);
}

/**
 * 瀑布流布局：按每张图片的原始长宽比多列排布，不裁剪、不留白。
 *
 * 技术选型：JS 显式计算每张图片的列位置（而非 CSS column-count），代价是实现更复杂，
 * 换来的是能严格保持"先行后列"的阅读顺序（贪心选当前最短的列），与拖拽排序、
 * +N 折叠的直觉顺序保持一致——CSS column-count 是先列后行，顺序观感会很不自然。
 *
 * 定位方式：所有 .plugin-image-wrapper 仍然保持原始 DOM 顺序（不做任何重新插入/分组），
 * 只是在瀑布流模式下用 CSS 变量 --plugin-masonry-left / --plugin-masonry-top /
 * --plugin-image-height 把每个 wrapper 改成 position: absolute 定位（见 styles.css）。
 * 这一点很关键：collectWrapperImageLines（drag-sort/持久化都依赖它）是按 DOM 顺序收集
 * markdown 行的，保持 DOM 顺序不变，才能保证瀑布流下拖拽排序、持久化仍然正确。
 *
 * 列宽直接复用当前的 S/M/L 画布尺寸（option.size），不额外引入独立的列数/列宽设置。
 */
export function applyMasonryLayout(
    container: HTMLDivElement,
    option: SettingOptions,
    onLimitTogglePersist?: () => void,
): void {
    const columnWidth = option.size;
    const gap = option.gap;

    let retryCount = 0;

    const run = () => {
        const items = Array.from(container.querySelectorAll<HTMLElement>(":scope > .plugin-image-wrapper"));
        if (items.length === 0) {
            setCssProps(container, { "--plugin-masonry-height": "0px" });
            return;
        }

        // 容器还没有正确布局（宽度为 0，例如笔记面板还在布局中）：有限次重试，
        // 避免"首次打开页面时列数算错"的问题（与 applyLimitRows 的重试策略一致）。
        if (container.clientWidth === 0 && retryCount < config.LIMIT_MAX_RETRY) {
            retryCount++;
            window.setTimeout(run, config.LIMIT_DELAY);
            return;
        }

        // 预清理：移除上一次遗留的蒙版/折叠状态，重新计算
        items.forEach((el) => {
            el.classList.remove("plugin-image-row-hidden", "plugin-image-more-wrapper");
            const oldMask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
            if (oldMask) oldMask.remove();
        });

        const columns = Math.max(1, Math.floor((container.clientWidth + gap) / (columnWidth + gap)));
        const colHeights = new Array<number>(columns).fill(0);

        // 折叠阈值：沿用网格模式"N 行 = N × (图片尺寸 + 间距)"的换算公式，保证用户从
        // 网格切到瀑布流时"显示多少内容"的直觉不突变。
        const thresholdPx = option.limit ? config.MAX_VISIBLE_ROWS * (option.size + option.gap) : Infinity;

        let fullMaxBottom = 0;
        let visibleMaxBottom = 0;
        let hiddenCount = 0;
        const colTruncated = new Array<boolean>(columns).fill(false);
        const colLastVisibleEl = new Array<HTMLElement | null>(columns).fill(null);
        const colVisibleBottom = new Array<number>(columns).fill(0);

        for (const el of items) {
            const img = el.querySelector<HTMLImageElement>("img.plugin-image");
            let itemHeight = columnWidth; // 加载失败的错误占位块没有 img，保持方形
            if (img) {
                if (img.naturalWidth && img.naturalHeight) {
                    itemHeight = Math.round((columnWidth * img.naturalHeight) / img.naturalWidth);
                } else {
                    // 图片还没加载完，先按方形占位；加载完成后用最新的长宽比重新计算一次
                    // （naturalWidth/Height 此时才可用）。只监听一次即可：本插件生成的
                    // 缩略图与原图长宽比始终一致，后续 src 从原图切换到缓存缩略图不会
                    // 改变比例，不需要重复监听。
                    img.addEventListener("load", () => applyMasonryLayout(container, option, onLimitTogglePersist), { once: true });
                }
            }

            // 贪心选择当前累计高度最小的列，保持整体"先行后列"的阅读顺序
            let colIdx = 0;
            for (let i = 1; i < columns; i++) {
                if (colHeights[i] < colHeights[colIdx]) colIdx = i;
            }

            const top = colHeights[colIdx];
            const left = colIdx * (columnWidth + gap);
            setCssProps(el, {
                "--plugin-masonry-left": `${left}px`,
                "--plugin-masonry-top": `${top}px`,
                "--plugin-image-height": `${itemHeight}px`,
            });
            colHeights[colIdx] = top + itemHeight + gap;

            const bottom = top + itemHeight;
            fullMaxBottom = Math.max(fullMaxBottom, bottom);

            if (bottom > thresholdPx) {
                // 这张图会让所在列超出折叠阈值：这张及之后排入该列的图都归入 "+N" 折叠部分
                el.classList.add("plugin-image-row-hidden");
                hiddenCount++;
                colTruncated[colIdx] = true;
            } else {
                visibleMaxBottom = Math.max(visibleMaxBottom, bottom);
                colLastVisibleEl[colIdx] = el;
                colVisibleBottom[colIdx] = bottom;
            }
        }

        if (hiddenCount > 0) {
            // "+N" 徽标固定叠加在被截断的最短列的最后一张可见图上：
            // 在所有发生截断的列中，选可见高度最小的那一列，视觉上最不容易被相邻更高的列遮挡。
            let overlayCol = -1;
            let overlayHeight = Infinity;
            for (let c = 0; c < columns; c++) {
                if (colTruncated[c] && colLastVisibleEl[c] && colVisibleBottom[c] < overlayHeight) {
                    overlayHeight = colVisibleBottom[c];
                    overlayCol = c;
                }
            }
            const overlayEl = overlayCol !== -1 ? colLastVisibleEl[overlayCol] : null;
            if (overlayEl) {
                overlayEl.classList.add("plugin-image-more-wrapper");
                const mask = createDiv({ cls: "plugin-image-more-mask" });
                const text = createSpan({ cls: "plugin-image-more-text", text: `+ ${hiddenCount}` });
                mask.appendChild(text);

                mask.addEventListener("click", (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    option.limit = false;
                    const limitCheckbox = containerLimitCheckboxMap.get(container);
                    if (limitCheckbox) limitCheckbox.checked = false;
                    applySettingsToContainer(container, option);
                    if (onLimitTogglePersist) onLimitTogglePersist();
                });

                overlayEl.appendChild(mask);
            }
        }

        setCssProps(container, {
            "--plugin-masonry-height": `${hiddenCount > 0 ? visibleMaxBottom : fullMaxBottom}px`,
        });

        ensureMasonryResizeObserver(container, option, onLimitTogglePersist);
    };

    window.requestAnimationFrame(run);
}
