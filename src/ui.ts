import { SettingOptions, SettingPanelDom } from "./domain";

/**
 * 创建图片容器元素，设置基础类名和间距变量。
 */
export function createImageContainerElement(option: SettingOptions): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add("plugin-image-container");
    container.style.setProperty("--plugin-container-gap", `${option.gap}px`);
    return container;
}

/**
 * 创建右上角的 setting 按钮（仅图标，无事件绑定）。
 */
export function createSettingButtonElement(): HTMLDivElement {
    const settingBtn = document.createElement("div");
    settingBtn.className = "plugin-image-setting-btn-container clickable-icon";
    settingBtn.setAttribute("aria-label", "Image group settings");

    const settingIcon = document.createElement("div");
    settingIcon.className = "icon--settings";

    settingBtn.appendChild(settingIcon);

    return settingBtn;
}

/**
 * 创建 setting 面板的 DOM 结构（尺寸单选 + 边框 / 阴影勾选）。
 * 只负责元素创建与基础属性，勾选状态与事件绑定由调用方处理。
 */
export function createSettingPanelDom(sizeGroupName: string): SettingPanelDom {
    // 尺寸选项分组（滑块样式的按钮组）
    const sizeGroup = document.createElement("div");
    sizeGroup.className = "plugin-image-setting-size-group";
    sizeGroup.dataset.size = "medium";

    // 背景滑块条
    const slider = document.createElement("div");
    slider.className = "plugin-image-setting-size-slider";
    sizeGroup.appendChild(slider);

    sizeGroup.appendChild(createSizeRadio("small", "S", sizeGroupName));
    sizeGroup.appendChild(createSizeRadio("medium", "M", sizeGroupName));
    sizeGroup.appendChild(createSizeRadio("large", "L", sizeGroupName));

    const panel = document.createElement("div");
    panel.className = "plugin-image-setting-panel";
    panel.appendChild(sizeGroup);
    panel.appendChild(createSettingCheckbox("border", "border"));
    panel.appendChild(createSettingCheckbox("shadow", "shadow"));
    panel.appendChild(createSettingCheckbox("hidden", "hidden"));
    panel.appendChild(createSettingCheckbox("limit", "limit"));

    const borderCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="border"]');
    const shadowCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="shadow"]');
    const hiddenCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="hidden"]');
    const limitCheckbox = panel.querySelector<HTMLInputElement>('input[data-setting="limit"]');
    const sizeRadios = Array.from(
        panel.querySelectorAll<HTMLInputElement>('input[type="radio"][name="' + sizeGroupName + '"]'),
    );

    return { panel, borderCheckbox, shadowCheckbox, hiddenCheckbox, limitCheckbox, sizeRadios };
}

// 尺寸选项单选（内部仍然使用 radio，外观是按钮组）
function createSizeRadio(sizeKey: "small" | "medium" | "large", labelText: string, sizeGroupName: string) {
    const label = document.createElement("label");
    label.className = "plugin-image-setting-size-radio";

    const input = document.createElement("input");
    input.type = "radio";
    input.className = "plugin-image-setting-size-radio-input";
    input.dataset.size = sizeKey;
    input.name = sizeGroupName;

    const textSpan = document.createElement("span");
    textSpan.className = "plugin-image-setting-size-radio-text";
    textSpan.textContent = labelText;

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
function createSettingCheckbox(settingKey: "border" | "shadow" | "hidden" | "limit", text: string) {
    const label = document.createElement("label");
    label.className = "plugin-image-setting-checkbox";

    const textSpan = document.createElement("span");
    textSpan.className = "plugin-image-setting-checkbox-label";
    textSpan.textContent = text;

    const switchWrapper = document.createElement("div");
    switchWrapper.className = "plugin-image-setting-switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "plugin-image-setting-switch-input";
    input.dataset.setting = settingKey;

    const track = document.createElement("span");
    track.className = "plugin-image-setting-switch-track";

    switchWrapper.appendChild(input);
    switchWrapper.appendChild(track);

    label.appendChild(textSpan);
    label.appendChild(switchWrapper);

    return label;
}


/**
 * 创建错误提示元素
 * 
 * @param option - 配置对象
 * @returns 错误提示元素
 */
export function createErrorDiv(option: SettingOptions): HTMLDivElement {
    const errorDiv = document.createElement("div");
    errorDiv.classList.add("plugin-image-error", "plugin-image");

    const icon = document.createElement("div");
    icon.className = "icon--error-picture";

    const text = document.createElement("span");
    text.textContent = "404";

    errorDiv.appendChild(icon);
    errorDiv.appendChild(text);
    errorDiv.style.setProperty("--plugin-image-size", `${option.size}px`);
    errorDiv.style.setProperty("--plugin-image-radius", `${option.radius}px`);
    if (option.shadow) errorDiv.classList.add("plugin-image-shadow")
    if (option.border) errorDiv.classList.add("plugin-image-border");
    return errorDiv;
}
