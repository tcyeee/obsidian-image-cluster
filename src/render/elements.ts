import { setIcon } from "obsidian";
import { SettingOptions, SettingPanelDom } from "../core/domain";
import { setCssProps } from "../core/dom";
import { t } from "../i18n";

/**
 * 创建图片容器元素，设置基础类名和间距变量。
 */
export function createImageContainerElement(option: SettingOptions): HTMLDivElement {
    const container = createDiv({ cls: "plugin-image-container" });
    setCssProps(container, { "--plugin-container-gap": `${option.gap}px` });
    return container;
}

/**
 * 创建右上角的 setting 按钮（仅图标，无事件绑定）。
 */
export function createSettingButtonElement(): HTMLDivElement {
    const settingBtn = createDiv({ cls: "plugin-image-setting-btn-container clickable-icon" });
    settingBtn.setAttribute("aria-label", t.settingPanel.groupSettingsAriaLabel);

    setIcon(settingBtn, "sliders-horizontal");

    return settingBtn;
}

/**
 * 创建 setting 面板的 DOM 结构（布局模式单选 + 尺寸单选 + 边框 / 阴影勾选）。
 * 只负责元素创建与基础属性，勾选状态与事件绑定由调用方处理。
 */
export function createSettingPanelDom(sizeGroupName: string, layoutGroupName: string): SettingPanelDom {
    // 布局模式分组（网格 / 瀑布流，滑块样式的按钮组）
    const layoutGroup = createDiv({ cls: "plugin-image-setting-layout-group" });
    layoutGroup.dataset.layout = "grid";

    const layoutSlider = createDiv({ cls: "plugin-image-setting-layout-slider" });
    layoutGroup.appendChild(layoutSlider);

    layoutGroup.appendChild(createLayoutRadio("grid", t.settingPanel.grid, layoutGroupName));
    layoutGroup.appendChild(createLayoutRadio("masonry", t.settingPanel.masonry, layoutGroupName));

    // 尺寸选项分组（滑块样式的按钮组）
    const sizeGroup = createDiv({ cls: "plugin-image-setting-size-group" });
    sizeGroup.dataset.size = "medium";

    // 背景滑块条
    const slider = createDiv({ cls: "plugin-image-setting-size-slider" });
    sizeGroup.appendChild(slider);

    sizeGroup.appendChild(createSizeRadio("small", "S", sizeGroupName));
    sizeGroup.appendChild(createSizeRadio("medium", "M", sizeGroupName));
    sizeGroup.appendChild(createSizeRadio("large", "L", sizeGroupName));

    const panel = createDiv({ cls: "plugin-image-setting-panel" });

    const layoutSection = createDiv({ cls: "plugin-image-setting-section" });
    layoutSection.appendChild(createSectionTitle(t.settingPanel.layout));
    layoutSection.appendChild(layoutGroup);
    panel.appendChild(layoutSection);

    const sizeSection = createDiv({ cls: "plugin-image-setting-section" });
    sizeSection.appendChild(createSectionTitle(t.settingPanel.canvasSize));
    sizeSection.appendChild(sizeGroup);
    panel.appendChild(sizeSection);

    const appearanceSection = createDiv({ cls: "plugin-image-setting-section" });
    appearanceSection.appendChild(createSectionTitle(t.settingPanel.appearance));
    const checkboxList = createDiv({ cls: "plugin-image-setting-checkbox-list" });
    checkboxList.appendChild(createSettingCheckbox("border", t.settingPanel.border));
    checkboxList.appendChild(createSettingCheckbox("shadow", t.settingPanel.shadow));
    checkboxList.appendChild(createSettingCheckbox("hidden", t.settingPanel.hidden));
    checkboxList.appendChild(createSettingCheckbox("limit", t.settingPanel.limit));
    checkboxList.appendChild(createSettingCheckbox("padding-left", t.settingPanel.paddingLeft));
    appearanceSection.appendChild(checkboxList);
    panel.appendChild(appearanceSection);

    // 面板底部：跳转到插件设置页（与上方分组用分割线隔开，事件绑定由调用方处理）
    const footer = createDiv({ cls: "plugin-image-setting-footer" });
    const pluginSettingsBtn = createDiv({ cls: "plugin-image-setting-footer-btn" });
    const pluginSettingsIcon = createSpan({ cls: "plugin-image-setting-footer-btn-icon" });
    setIcon(pluginSettingsIcon, "settings");
    const pluginSettingsLabel = createSpan({ cls: "plugin-image-setting-footer-btn-label", text: t.settingPanel.pluginSettings });
    pluginSettingsBtn.appendChild(pluginSettingsIcon);
    pluginSettingsBtn.appendChild(pluginSettingsLabel);
    footer.appendChild(pluginSettingsBtn);
    panel.appendChild(footer);

    const borderCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="border"]');
    const shadowCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="shadow"]');
    const hiddenCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="hidden"]');
    const limitCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="limit"]');
    const paddingLeftCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="padding-left"]');
    const sizeRadios = Array.from(
        panel.querySelectorAll<HTMLInputElement>('input[type="radio"][name="' + sizeGroupName + '"]'),
    );
    const layoutRadios = Array.from(
        panel.querySelectorAll<HTMLInputElement>('input[type="radio"][name="' + layoutGroupName + '"]'),
    );

    return { panel, borderCheckbox, shadowCheckbox, hiddenCheckbox, limitCheckbox, paddingLeftCheckbox, sizeRadios, layoutRadios, pluginSettingsBtn };
}

// 面板分组标题（如 "Canvas size" / "Appearance"）
function createSectionTitle(text: string) {
    return createDiv({ cls: "plugin-image-setting-section-title", text });
}

// 尺寸选项单选（内部仍然使用 radio，外观是按钮组）
function createSizeRadio(sizeKey: "small" | "medium" | "large", labelText: string, sizeGroupName: string) {
    const label = createEl("label", { cls: "plugin-image-setting-size-radio" });

    const input = createEl("input", { cls: "plugin-image-setting-size-radio-input", type: "radio" });
    input.dataset.size = sizeKey;
    input.name = sizeGroupName;

    const textSpan = createSpan({ cls: "plugin-image-setting-size-radio-text", text: labelText });

    label.appendChild(input);
    label.appendChild(textSpan);
    return label;
}

// 布局模式单选（网格 / 瀑布流，内部仍然使用 radio，外观是按钮组）
function createLayoutRadio(layoutKey: "grid" | "masonry", labelText: string, layoutGroupName: string) {
    const label = createEl("label", { cls: "plugin-image-setting-layout-radio" });

    const input = createEl("input", { cls: "plugin-image-setting-layout-radio-input", type: "radio" });
    input.dataset.layout = layoutKey;
    input.name = layoutGroupName;

    const textSpan = createSpan({ cls: "plugin-image-setting-layout-radio-text", text: labelText });

    label.appendChild(input);
    label.appendChild(textSpan);
    return label;
}

/**
 * 创建 setting 面板中的 checkbox 元素
 * 
 * @param settingKey - 设置键（border / shadow / hidden）
 * @param text - 文字
 * @param checked - 是否选中
 * @returns 
 */
function createSettingCheckbox(settingKey: "border" | "shadow" | "hidden" | "limit" | "padding-left", text: string) {
    const label = createEl("label", { cls: "plugin-image-setting-checkbox" });

    const textSpan = createSpan({ cls: "plugin-image-setting-checkbox-label", text });

    const switchWrapper = createDiv({ cls: "plugin-image-setting-switch" });

    const input = createEl("input", { cls: "plugin-image-setting-switch-input", type: "checkbox" });
    input.dataset.setting = settingKey;

    const track = createSpan({ cls: "plugin-image-setting-switch-track" });

    switchWrapper.appendChild(input);
    switchWrapper.appendChild(track);

    label.appendChild(textSpan);
    label.appendChild(switchWrapper);

    return label;
}


/**
 * 按当前 DOM 顺序收集容器内各图片 wrapper 保存的原始 Markdown 行。
 * 供拖拽排序/排除/删除/拖入等操作在落盘前，把「渲染层的 DOM 顺序」转换成
 * 「持久化层需要的一份普通字符串数组」——persistence.ts 本身不直接查询 DOM，
 * 只接收这份数组，保持 markdown 读改写逻辑与 render 层的 DOM 结构解耦。
 */
export function collectWrapperImageLines(container: HTMLDivElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"))
        .map(w => w.dataset.imgLine)
        .filter((line): line is string => !!line);
}

/**
 * 创建错误提示元素
 * 
 * @param option - 配置对象
 * @returns 错误提示元素
 */
export function createErrorDiv(option: SettingOptions): HTMLDivElement {
    const errorDiv = createDiv({ cls: ["plugin-image-error", "plugin-image"] });

    const icon = createDiv({ cls: "icon--error-picture" });

    const text = createSpan({ text: "404" });

    errorDiv.appendChild(icon);
    errorDiv.appendChild(text);
    setCssProps(errorDiv, {
        "--plugin-image-size": `${option.size}px`,
        "--plugin-image-radius": `${option.radius}px`,
    });
    if (option.shadow) errorDiv.classList.add("plugin-image-shadow")
    return errorDiv;
}
