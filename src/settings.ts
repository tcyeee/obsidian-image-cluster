import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import ImgRowPlugin from "main";
import { config, runtimeDefaults } from "./core/config";

export interface ImgRowPluginSettings {
    defaultSize: "small" | "medium" | "large";
    defaultBorder: boolean;
    defaultShadow: boolean;
    enableHoverGroupButton: boolean;
    enableDragToGroup: boolean;
    enableThumbnailBorderTrim: boolean;
}

export const DEFAULT_SETTINGS: ImgRowPluginSettings = {
    defaultSize: "medium",
    defaultBorder: false,
    defaultShadow: false,
    enableHoverGroupButton: true,
    enableDragToGroup: true,
    enableThumbnailBorderTrim: true,
};

/** 将插件设置同步写入 runtimeDefaults，使后续新建的图片组生效 */
export function applySettingsToConfig(settings: ImgRowPluginSettings) {
    switch (settings.defaultSize) {
        case "small":
            runtimeDefaults.size   = config.SMALL_SIZE;
            runtimeDefaults.gap    = config.SMALL_GAP;
            runtimeDefaults.radius = config.SMALL_RADIUS;
            break;
        case "large":
            runtimeDefaults.size   = config.LARGE_SIZE;
            runtimeDefaults.gap    = config.LARGE_GAP;
            runtimeDefaults.radius = config.LARGE_RADIUS;
            break;
        default: // medium
            runtimeDefaults.size   = config.MEDIUM_SIZE;
            runtimeDefaults.gap    = config.MEDIUM_GAP;
            runtimeDefaults.radius = config.MEDIUM_RADIUS;
    }
    runtimeDefaults.border = settings.defaultBorder;
    runtimeDefaults.shadow = settings.defaultShadow;
}

export class ImgRowSettingTab extends PluginSettingTab {
    plugin: ImgRowPlugin;

    constructor(app: App, plugin: ImgRowPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 声明式设置项（Obsidian 1.13.0+）。只要这个方法返回非空数组，框架就完全接管渲染，
     * display() 不会被调用——好处是设置项能被 Obsidian 的设置搜索索引到。
     *
     * 每一项都用 render 型定义（而不是 control + key 的声明式绑定）：框架建好空的 Setting
     * 行传进来，name/desc 由框架渲染，回调里原样保留迁移前的 addToggle/addDropdown 链式代码，
     * 不需要为每个字段另外设计 key 和 getControlValue/setControlValue 存取逻辑。
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: "Default image size",
                desc: "Size applied to new image groups that have no explicit size setting.",
                render: (setting: Setting) => {
                    setting.addDropdown(drop =>
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
                },
            },
            {
                name: "Default border",
                desc: "Show a border around each image by default.",
                render: (setting: Setting) => {
                    setting.addToggle(toggle =>
                        toggle
                            .setValue(this.plugin.settings.defaultBorder)
                            .onChange(async value => {
                                this.plugin.settings.defaultBorder = value;
                                applySettingsToConfig(this.plugin.settings);
                                await this.plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: "Default shadow",
                desc: "Show a drop shadow under each image by default.",
                render: (setting: Setting) => {
                    setting.addToggle(toggle =>
                        toggle
                            .setValue(this.plugin.settings.defaultShadow)
                            .onChange(async value => {
                                this.plugin.settings.defaultShadow = value;
                                applySettingsToConfig(this.plugin.settings);
                                await this.plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: "Hover-to-group button",
                desc: "Show a button on hover over a standalone image (live preview) to convert it into an image group.",
                render: (setting: Setting) => {
                    setting.addToggle(toggle =>
                        toggle
                            .setValue(this.plugin.settings.enableHoverGroupButton)
                            .onChange(async value => {
                                this.plugin.settings.enableHoverGroupButton = value;
                                await this.plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: "Drag images in/out of groups",
                desc: "Allow dragging a standalone image (live preview) into an existing image group, and dragging an image out of a group back into the editor.",
                render: (setting: Setting) => {
                    setting.addToggle(toggle =>
                        toggle
                            .setValue(this.plugin.settings.enableDragToGroup)
                            .onChange(async value => {
                                this.plugin.settings.enableDragToGroup = value;
                                await this.plugin.saveSettings();
                            })
                    );
                },
            },
            {
                name: "Trim solid-color borders in thumbnails",
                desc: "When generating a thumbnail, try to detect and remove a solid-color border (such as black canvas padding in a design mockup) before cropping to a square, so it doesn't get baked into the thumbnail. Only affects newly generated thumbnails, not ones already cached.",
                render: (setting: Setting) => {
                    setting.addToggle(toggle =>
                        toggle
                            .setValue(this.plugin.settings.enableThumbnailBorderTrim)
                            .onChange(async value => {
                                this.plugin.settings.enableThumbnailBorderTrim = value;
                                await this.plugin.saveSettings();
                            })
                    );
                },
            },
        ];
    }
}
