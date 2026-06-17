import ImgRowPlugin from "main";
import { getImageSyntaxes, hasMarkdownImage, imgsWrapper } from "./markdown/image-syntax";

/**
 * 在编辑器（源模式 / 实时预览）的右键菜单中追加一项： 
 * 当光标所在行包含 Markdown 图片语法时（![](...) 或 ![[]]），
 * 认为用户右键了图片附近，然后将其包装成 ```imgs 代码块
 */
export function registerEditorMenu(that: ImgRowPlugin) {
    that.registerEvent(
        that.app.workspace.on("editor-menu", (menu, editor) => {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line) ?? "";

            // 如果当前行不包含图片语法，则直接返回
            if (!hasMarkdownImage(line)) return;

            // 拿到其中代表图片的 Markdown 语法
            const imageSyntax = getImageSyntaxes(line);
            menu.addItem((item) => {
                item
                    .setIcon("image")
                    .setTitle("Group images")
                    .onClick(() => {
                        const wrappedImageSyntax = imgsWrapper(imageSyntax);
                        // 使用生成的 ```imgs 代码块替换当前行的图片语法
                        const lineNo = cursor.line;
                        editor.replaceRange(
                            wrappedImageSyntax,
                            { line: lineNo, ch: 0 },
                            { line: lineNo, ch: line.length },
                        );
                    });
            });
        }),
    );
}