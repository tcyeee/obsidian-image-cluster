import ImgRowPlugin from "main";
import { buildGroupBlockForLine, hasMarkdownImage } from "./markdown/image-syntax";

/**
 * 在编辑器（源模式 / 实时预览）的右键菜单中追加一项：
 * 当光标所在行包含 Markdown 图片语法时（![](...) 或 ![[]]），
 * 认为用户右键了图片附近，然后将其包装成 ```imgs 代码块。
 *
 * 与 Live Preview 悬停按钮（hover-group-trigger.ts）是同一个功能的两个入口，
 * 共用 buildGroupBlockForLine 生成替换文本，行为保持一致。
 */
export function registerEditorMenu(that: ImgRowPlugin) {
    that.registerEvent(
        that.app.workspace.on("editor-menu", (menu, editor) => {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line) ?? "";

            // 如果当前行不包含图片语法，则不加这一项
            if (!hasMarkdownImage(line)) return;

            menu.addItem((item) => {
                item
                    .setIcon("lucide-layout-grid")
                    .setTitle("Group images")
                    .onClick(() => {
                        const lineNo = cursor.line;
                        const prevLine = lineNo > 0 ? (editor.getLine(lineNo - 1) ?? "") : "";
                        const block = buildGroupBlockForLine(line, prevLine);
                        if (!block) return;
                        // 用生成的 ```imgs 代码块替换当前行（行内非图片文字保留在代码块上/下方）
                        editor.replaceRange(
                            block,
                            { line: lineNo, ch: 0 },
                            { line: lineNo, ch: line.length },
                        );
                    });
            });
        }),
    );
}
