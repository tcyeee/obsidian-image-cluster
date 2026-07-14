import { Plugin } from "obsidian";
import { addImageLayoutMarkdownProcessor } from "./src/render/processor";
import { registerEditorMenu } from "./src/editor-menu";
import { registerHoverGroupTrigger } from "./src/hover-group-trigger";
import { registerImageDragSource } from "./src/image-drag-source";
import { registerEditorDropTarget } from "./src/editor-drop-target";
import { ImgRowPluginSettings, DEFAULT_SETTINGS, ImgRowSettingTab, applySettingsToConfig } from "./src/settings";
import { registerThumbnailCacheLifecycle } from "./src/thumbnail/thumbnail";

export default class ImgRowPlugin extends Plugin {
	settings: ImgRowPluginSettings;

	async onload() {
		await this.loadSettings();

		// 自动解析imgs代码块
		addImageLayoutMarkdownProcessor(this);
		// 注册针对图片的右键菜单
		registerEditorMenu(this);
		// 注册 Live Preview 下悬停图片出现的「转图片组」按钮
		registerHoverGroupTrigger(this);
		// 注册独立图片拖入已有图片组的功能
		registerImageDragSource(this);
		// 注册"拖出图片组"落到编辑器空白处的功能
		registerEditorDropTarget(this);
		// 注册设置页
		this.addSettingTab(new ImgRowSettingTab(this.app, this));
		// 原图被原生方式重命名/删除时，同步迁移/清理对应的缓存缩略图，避免孤儿文件
		registerThumbnailCacheLifecycle(this);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ImgRowPluginSettings>);
		// 将已保存的设置同步写入 config，使默认值即刻生效
		applySettingsToConfig(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
