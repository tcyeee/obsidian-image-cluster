import { Plugin } from "obsidian";
import { addImageLayoutMarkdownProcessor } from "./src/processor";
import { registerEditorMenu } from "./src/register";
import { ImgRowPluginSettings, DEFAULT_SETTINGS, ImgRowSettingTab, applySettingsToConfig } from "./src/settings";

export default class ImgRowPlugin extends Plugin {
	settings: ImgRowPluginSettings;

	async onload() {
		await this.loadSettings();

		// 自动解析imgs代码块
		addImageLayoutMarkdownProcessor(this);
		// 注册针对图片的右键菜单
		registerEditorMenu(this);
		// 注册设置页
		this.addSettingTab(new ImgRowSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 将已保存的设置同步写入 config，使默认值即刻生效
		applySettingsToConfig(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
