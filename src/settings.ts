import { App, PluginSettingTab, Setting } from "obsidian";
import ImgRowPlugin from "main";
import { config } from "./core/config";

export interface ImgRowPluginSettings {
    defaultSize: "small" | "medium" | "large";
    defaultBorder: boolean;
    defaultShadow: boolean;
    enableHoverGroupButton: boolean;
    enableDragToGroup: boolean;
}

export const DEFAULT_SETTINGS: ImgRowPluginSettings = {
    defaultSize: "medium",
    defaultBorder: false,
    defaultShadow: false,
    enableHoverGroupButton: true,
    enableDragToGroup: true,
};

/** 将插件设置同步写入 config 默认值，使后续新建的图片组生效 */
export function applySettingsToConfig(settings: ImgRowPluginSettings) {
    switch (settings.defaultSize) {
        case "small":
            config.DEFAULT_SIZE   = config.SMALL_SIZE;
            config.DEFAULT_GAP    = config.SMALL_GAP;
            config.DEFAULT_RADIUS = config.SMALL_RADIUS;
            break;
        case "large":
            config.DEFAULT_SIZE   = config.LARGE_SIZE;
            config.DEFAULT_GAP    = config.LARGE_GAP;
            config.DEFAULT_RADIUS = config.LARGE_RADIUS;
            break;
        default: // medium
            config.DEFAULT_SIZE   = config.MEDIUM_SIZE;
            config.DEFAULT_GAP    = config.MEDIUM_GAP;
            config.DEFAULT_RADIUS = config.MEDIUM_RADIUS;
    }
    config.DEFAULT_BORDER = settings.defaultBorder;
    config.DEFAULT_SHADOW = settings.defaultShadow;
}

export class ImgRowSettingTab extends PluginSettingTab {
    plugin: ImgRowPlugin;

    constructor(app: App, plugin: ImgRowPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Default image size")
            .setDesc("Size applied to new image groups that have no explicit size setting.")
            .addDropdown(drop =>
                drop
                    .addOption("small",  "Small (90px)")
                    .addOption("medium", "Medium (150px)")
                    .addOption("large",  "Large (220px)")
                    .setValue(this.plugin.settings.defaultSize)
                    .onChange(async value => {
                        this.plugin.settings.defaultSize = value as ImgRowPluginSettings["defaultSize"];
                        applySettingsToConfig(this.plugin.settings);
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Default border")
            .setDesc("Show a border around each image by default.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.defaultBorder)
                    .onChange(async value => {
                        this.plugin.settings.defaultBorder = value;
                        applySettingsToConfig(this.plugin.settings);
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Default shadow")
            .setDesc("Show a drop shadow under each image by default.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.defaultShadow)
                    .onChange(async value => {
                        this.plugin.settings.defaultShadow = value;
                        applySettingsToConfig(this.plugin.settings);
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Hover-to-group button")
            .setDesc("Show a button on hover over a standalone image (Live Preview) to convert it into an image group.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableHoverGroupButton)
                    .onChange(async value => {
                        this.plugin.settings.enableHoverGroupButton = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Drag image into group")
            .setDesc("Allow dragging a standalone image (Live Preview) into an existing image group.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableDragToGroup)
                    .onChange(async value => {
                        this.plugin.settings.enableDragToGroup = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
