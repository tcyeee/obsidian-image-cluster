import { App, Modal, Setting } from "obsidian";

/**
 * 删除图片前的确认弹窗。
 * 仅在该图片被 vault 中其他地方引用时才会弹出（未被引用时直接删除，见 image-actions.ts），
 * 提示用户并提供「仅从组中移除」（等同排除，见 excludeImageBelowGroup）的退路，
 * 避免误删一张仍被其他笔记依赖的原图。
 */
export class ConfirmDeleteImageModal extends Modal {
    constructor(
        app: App,
        private otherRefCount: number,
        private onChoice: (deleteOriginal: boolean) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        // 标题走 Modal 自带的 titleEl（setTitle），不要在 contentEl 里手搓 <h3>——
        // 后者既拿不到 Obsidian 的标题样式，也会被提交审核判为直接构造标题元素。
        this.setTitle("Delete image");
        contentEl.createEl("p", {
            text: `This image is referenced in ${this.otherRefCount} other place${this.otherRefCount > 1 ? "s" : ""} in your vault. Deleting the original file will break those references.`,
        });
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText("Remove from group only")
                .onClick(() => {
                    this.close();
                    this.onChoice(false);
                }))
            .addButton(btn => btn
                .setButtonText("Delete original anyway")
                .setDestructive()
                .onClick(() => {
                    this.close();
                    this.onChoice(true);
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
