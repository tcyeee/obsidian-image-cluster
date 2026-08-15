import { config, runtimeDefaults } from "./config";

export class SettingOptions {
    size: number = runtimeDefaults.size;
    radius: number = runtimeDefaults.radius;
    gap: number = runtimeDefaults.gap;
    shadow: boolean = runtimeDefaults.shadow;
    border: boolean = runtimeDefaults.border;
    hidden: boolean = config.DEFAULT_HIDDEN;
    limit: boolean = config.DEFAULT_LIMIT;
    paddingLeft: number = config.DEFAULT_PADDING_LEFT;

    /**
     * 将 SettingOptions 转为配置行字符串，供 parseStyleOptions 使用。
     */
    buildStyleLineConfig(): string {
        const parts: string[] = [];
        parts.push(`size=${this.size}`);
        parts.push(`gap=${this.gap}`);
        parts.push(`radius=${this.radius}`);
        parts.push(`shadow=${this.shadow}`);
        parts.push(`border=${this.border}`);
        parts.push(`hidden=${this.hidden}`);
        parts.push(`limit=${this.limit}`);
        parts.push(`padding-left=${this.paddingLeft}`);
        return parts.join("&");
    }
}

export interface SettingPanelDom {
    panel: HTMLDivElement;
    borderCheckbox: HTMLInputElement | null;
    shadowCheckbox: HTMLInputElement | null;
    hiddenCheckbox: HTMLInputElement | null;
    limitCheckbox: HTMLInputElement | null;
    paddingLeftCheckbox: HTMLInputElement | null;
    sizeRadios: HTMLInputElement[];
}