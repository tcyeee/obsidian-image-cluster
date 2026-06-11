import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext } from "obsidian";
import { SettingOptions, SettingPanelDom } from "../core/domain";
import { setCssProps } from "../core/dom";
import { config } from "../core/config";
import { persistOptionsToSource } from "../markdown/persistence";
import { createImageContainerElement, createSettingButtonElement, createSettingPanelDom } from "./elements";
import { applySettingsToContainer, containerLimitCheckboxMap } from "./layout";

/**
 * 创建图片容器及右上角的设置面板。
 * 面板中的控件会和传入的 SettingOptions 进行绑定，并在修改时写回到 Markdown 源码。
 *
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 * @returns 图片容器
 */
export function createContainer(option: SettingOptions, plugin: ImgRowPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement): HTMLDivElement {
    const container = createImageContainerElement(option);

    // 外层包装：统一承载 setting 按钮 + 面板，便于整体迁移到 .cm-preview-code-block
    const settingWrapper = createDiv({ cls: "plugin-image-setting-outer" });
    container.appendChild(settingWrapper);

    const settingBtn = createSettingButtonElement();
    settingWrapper.appendChild(settingBtn);

    // 为每个容器生成独立的 radio 分组名，避免多个代码块之间互相影响
    const sizeGroupName = `imgs-size-${Math.random().toString(36).slice(2, 8)}`;

    // setting 面板由 setupSettingPanel 创建；
    // 挂到 activeDocument.body 以彻底脱离 CodeMirror 渲染树，
    // 避免祖先元素的 transform/will-change 干扰 position:fixed 定位
    const { panel, persistIfNeeded, limitCheckbox } = setupSettingPanel(option, plugin, ctx, el, container, sizeGroupName);
    activeDocument.body.appendChild(panel);
    // 关联 limitCheckbox，供蒙版点击时同步 UI 状态
    if (limitCheckbox) containerLimitCheckboxMap.set(container, limitCheckbox);

    const isPanelOpen = () => panel.classList.contains("plugin-image-setting-panel--open");
    const openPanel = () => {
        // 根据按钮当前的视口坐标动态定位面板
        const rect = settingWrapper.getBoundingClientRect();
        setCssProps(panel, {
            "--plugin-panel-top": `${rect.bottom + 4}px`,
            "--plugin-panel-right": `${window.innerWidth - rect.right}px`,
        });
        panel.classList.add("plugin-image-setting-panel--open");
    };
    const closePanel = () => {
        if (!isPanelOpen()) return;
        persistIfNeeded();
        panel.classList.remove("plugin-image-setting-panel--open");
    };

    // setting按钮点击显示/隐藏面板
    settingBtn.onclick = (e) => {
        e.stopPropagation();
        if (isPanelOpen()) { closePanel(); } else { openPanel(); }
    };

    // 点击 wrapper 或 panel 之外时自动关闭（panel 已移至 body，需单独判断）
    // 使用 AbortController 以便在容器销毁时移除监听器，避免泄漏
    const clickAbortCtrl = new AbortController();
    activeDocument.addEventListener("click", (e: MouseEvent) => {
        // 容器已从 DOM 中移除时，顺带清理 panel 和监听器
        if (!container.isConnected) {
            panel.remove();
            clickAbortCtrl.abort();
            return;
        }
        // targetNode 是 Obsidian 对 UIEvent 的跨窗口安全扩展，替代 instanceof Node 判断
        const target = e.targetNode;
        if (!target) return;
        if (!settingWrapper.contains(target) && !panel.contains(target)) {
            closePanel();
        }
    }, { signal: clickAbortCtrl.signal });
    // 插件卸载时清理挂在 document.body 上的浮动面板和事件监听器
    plugin.register(() => {
        panel.remove();
        clickAbortCtrl.abort();
    });

    // 安全区域：面板顶部透明块，覆盖按钮与面板之间的间隙，防止鼠标经过间隙时面板提前消失
    const safeZone = createDiv({ cls: "plugin-image-panel-safe-zone" });
    panel.appendChild(safeZone);

    // 鼠标移入/移出图片容器：控制阅读模式下按钮的可见性
    // 编辑模式下 wrapper 已迁移到 .cm-preview-code-block，由 CSS :hover 控制可见性
    container.addEventListener("mouseenter", () => {
        settingBtn.classList.add("plugin-image-setting-btn-container--visible");
    });
    container.addEventListener("mouseleave", (e: MouseEvent) => {
        settingBtn.classList.remove("plugin-image-setting-btn-container--visible");
        // 如果鼠标移入了面板（含安全区域），不关闭面板
        if (container.contains(settingWrapper) && panel.contains(e.relatedTarget as Node)) return;
        closePanel();
    });

    // 鼠标离开面板（含安全区域）时关闭
    panel.addEventListener("mouseleave", (e: MouseEvent) => {
        // 如果鼠标回到了容器（按钮区域），由容器的 mouseleave 逻辑决定是否关闭
        if (container.contains(e.relatedTarget as Node)) return;
        closePanel();
    });

    return container;
}

/**
 * 创建并初始化 setting 面板，包括：
 * - DOM 结构（尺寸单选 + 边框/阴影勾选）
 * - 根据当前配置设置初始勾选状态
 * - 绑定变更事件并在需要时触发持久化
 *
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 * @param container - 图片容器
 * @param sizeGroupName - 尺寸单选组名
 * @returns 设置面板
 *   { panel: HTMLDivElement; persistIfNeeded: () => void; limitCheckbox: HTMLInputElement | null }
 *     panel: 设置面板
 *     persistIfNeeded: 持久化函数 （在需要时将更改写回到对应 Markdown 文件）
 *     limitCheckbox: limit 复选框元素（供外部同步 UI 状态）
 */
function setupSettingPanel(
    option: SettingOptions,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    container: HTMLDivElement,
    sizeGroupName: string,
): { panel: HTMLDivElement; persistIfNeeded: () => void; limitCheckbox: HTMLInputElement | null } {
    const { panel, borderCheckbox, shadowCheckbox, hiddenCheckbox, limitCheckbox, sizeRadios }: SettingPanelDom = createSettingPanelDom(sizeGroupName);

    // 注意：panel 的 DOM 挂载由调用方（createContainer）负责

    // 根据当前的配置初始化面板勾选状态
    if (borderCheckbox) borderCheckbox.checked = option.border;
    if (shadowCheckbox) shadowCheckbox.checked = option.shadow;
    if (hiddenCheckbox) hiddenCheckbox.checked = option.hidden;
    if (limitCheckbox) limitCheckbox.checked = option.limit;
    // 根据当前 size 推断 S / M / L
    const currentSize = option.size;
    const pickSizeLabel = currentSize <= config.SMALL_SIZE ? "small" : currentSize <= config.MEDIUM_SIZE ? "medium" : "large";
    sizeRadios.forEach((radio) => {
        if (radio.dataset.size === pickSizeLabel) {
            radio.checked = true;
        }
    });
    const sizeGroupEl = panel.querySelector<HTMLDivElement>(".plugin-image-setting-size-group");
    if (sizeGroupEl) sizeGroupEl.dataset.size = pickSizeLabel;

    // 标记当前面板中的设置是否有尚未写回文件的更改
    let hasPendingChanges = false;

    // 在需要时将更改写回到对应 Markdown 文件（例如关闭面板时）
    const persistIfNeeded = () => {
        if (!hasPendingChanges) return;
        hasPendingChanges = false;
        void persistOptionsToSource(option, plugin, ctx, el);
    };

    // 绑定事件：勾选框/单选按钮改变时，实时更新配置并作用到当前容器（但先不立刻写文件）
    borderCheckbox?.addEventListener("change", () => {
        option.border = !!borderCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    shadowCheckbox?.addEventListener("change", () => {
        option.shadow = !!shadowCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    hiddenCheckbox?.addEventListener("change", () => {
        option.hidden = !!hiddenCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    limitCheckbox?.addEventListener("change", () => {
        option.limit = !!limitCheckbox.checked;
        // 应用到当前容器，同时为「+N」蒙版提供一个简单的持久化回调：
        // 当用户点击蒙版关闭 limit 时，会调用该回调，把最新配置写回到代码块配置行。
        applySettingsToContainer(container, option, () => {
            void persistOptionsToSource(option, plugin, ctx, el);
        });
        // 对于通过设置面板主动修改 limit 的场景，仍然沿用「关闭面板时统一写回」的逻辑。
        hasPendingChanges = true;
    });
    sizeRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (!radio.checked) return;
            // 给 S / M / L 映射一个具体像素值
            const sizeLabel = radio.dataset.size;
            const sizeGroup = panel.querySelector<HTMLDivElement>(".plugin-image-setting-size-group");
            if (sizeGroup && sizeLabel) {
                sizeGroup.dataset.size = sizeLabel;
            }
            switch (sizeLabel) {
                case "small":
                    option.size = config.SMALL_SIZE;
                    option.gap = config.SMALL_GAP;
                    option.radius = config.SMALL_RADIUS;
                    break;
                case "medium":
                    option.size = config.MEDIUM_SIZE;
                    option.gap = config.MEDIUM_GAP;
                    option.radius = config.MEDIUM_RADIUS;
                    break;
                case "large":
                    option.size = config.LARGE_SIZE;
                    option.gap = config.LARGE_GAP;
                    option.radius = config.LARGE_RADIUS;
                    break;
            }
            applySettingsToContainer(container, option);
            hasPendingChanges = true;
        });
    });

    return { panel, persistIfNeeded, limitCheckbox };
}
