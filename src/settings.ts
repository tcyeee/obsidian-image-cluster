import { App, Notice, PluginSettingTab, Setting, SettingDefinitionItem, TextComponent, ButtonComponent } from "obsidian";
import ImgRowPlugin from "main";
import { config, runtimeDefaults, isDotPrefixedCachePath, normalizeCacheFolderPath } from "./core/config";
import { t, setLocale, LanguagePreference } from "./i18n";

export interface ImgRowPluginSettings {
    language: LanguagePreference;
    defaultSize: "small" | "medium" | "large";
    defaultBorder: boolean;
    defaultShadow: boolean;
    enableHoverGroupButton: boolean;
    enableDragToGroup: boolean;
    enableThumbnailBorderTrim: boolean;
    cachePath: string;
}

export const DEFAULT_SETTINGS: ImgRowPluginSettings = {
    language: "auto",
    defaultSize: "medium",
    defaultBorder: false,
    defaultShadow: false,
    enableHoverGroupButton: true,
    enableDragToGroup: true,
    enableThumbnailBorderTrim: true,
    cachePath: config.DEFAULT_THUMBNAIL_PATH,
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

    // 防御性兜底：正常情况下设置页的 UI 已经拒绝了点开头的非法路径，这里再检查一次是
    // 为了兼容 data.json 被手动编辑成非法值的情况，避免缓存目录悄悄变成 Obsidian 不索引的路径。
    const normalizedCachePath = normalizeCacheFolderPath(settings.cachePath);
    runtimeDefaults.thumbnailPath = isDotPrefixedCachePath(normalizedCachePath)
        ? normalizeCacheFolderPath(config.DEFAULT_THUMBNAIL_PATH)
        : normalizedCachePath;
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
                type: "group",
                heading: t.settings.groupGeneral,
                items: [
                    {
                        name: t.settings.language.name,
                        desc: t.settings.language.desc,
                        render: (setting: Setting) => {
                            setting.addDropdown(drop =>
                                drop
                                    .addOption("auto", t.settings.language.auto)
                                    .addOption("en", t.settings.language.en)
                                    .addOption("zh", t.settings.language.zh)
                                    .setValue(this.plugin.settings.language)
                                    .onChange(async value => {
                                        this.plugin.settings.language = value as ImgRowPluginSettings["language"];
                                        setLocale(this.plugin.settings.language);
                                        await this.plugin.saveSettings();
                                        // 重新渲染设置页，让设置项本身立即以新语言显示；其余 UI（菜单、面板等）
                                        // 因为共享同一个 t 对象，下次渲染时会自动读到新文案。display() 在声明式
                                        // 设置页（getSettingDefinitions 非空）下已被废弃、不会被调用，需用 update()。
                                        this.update();
                                    })
                            );
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: t.settings.groupDefaultStyle,
                items: [
                    {
                        name: t.settings.defaultSize.name,
                        desc: t.settings.defaultSize.desc,
                        render: (setting: Setting) => {
                            setting.addDropdown(drop =>
                                drop
                                    .addOption("small",  t.settings.defaultSize.small)
                                    .addOption("medium", t.settings.defaultSize.medium)
                                    .addOption("large",  t.settings.defaultSize.large)
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
                        name: t.settings.defaultBorder.name,
                        desc: t.settings.defaultBorder.desc,
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
                        name: t.settings.defaultShadow.name,
                        desc: t.settings.defaultShadow.desc,
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
                ],
            },
            {
                type: "page",
                name: t.settings.groupAdvanced.name,
                desc: t.settings.groupAdvanced.desc,
                items: [
                    {
                        name: t.settings.cachePath.name,
                        desc: t.settings.cachePath.desc,
                        render: (setting: Setting) => {
                            let textComponent: TextComponent;
                            let confirmButton: ButtonComponent;
                            let cancelButton: ButtonComponent;

                            // 确认/取消按钮只在输入框内容与已保存值不一致时出现，平时收起，避免占用设置面板空间。
                            const refreshButtonsVisibility = () => {
                                const hasPendingChange = textComponent.getValue() !== this.plugin.settings.cachePath;
                                confirmButton.buttonEl.toggle(hasPendingChange);
                                cancelButton.buttonEl.toggle(hasPendingChange);
                            };

                            setting.addText(text => {
                                textComponent = text;
                                text
                                    .setPlaceholder(config.DEFAULT_THUMBNAIL_PATH)
                                    .setValue(this.plugin.settings.cachePath)
                                    .onChange(() => refreshButtonsVisibility());
                            });

                            setting.addButton(button => {
                                confirmButton = button;
                                button
                                    .setIcon("check")
                                    .setTooltip(t.settings.cachePath.apply)
                                    .setCta()
                                    .onClick(async () => {
                                        const rawValue = textComponent.getValue();
                                        if (isDotPrefixedCachePath(normalizeCacheFolderPath(rawValue))) {
                                            new Notice(t.settings.cachePath.invalidPath);
                                            return;
                                        }
                                        this.plugin.settings.cachePath = rawValue;
                                        applySettingsToConfig(this.plugin.settings);
                                        await this.plugin.saveSettings();
                                        refreshButtonsVisibility();
                                    });
                            });

                            setting.addButton(button => {
                                cancelButton = button;
                                button
                                    .setIcon("x")
                                    .setTooltip(t.settings.cachePath.discard)
                                    .onClick(() => {
                                        textComponent.setValue(this.plugin.settings.cachePath);
                                        refreshButtonsVisibility();
                                    });
                            });

                            refreshButtonsVisibility();
                        },
                    },
                ],
            },
        ];
    }
}
