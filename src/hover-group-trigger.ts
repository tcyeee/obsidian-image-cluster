import ImgRowPlugin from "main";
import { setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import { getImageSyntaxes, hasMarkdownImage, imgsWrapper, isListLine } from "./markdown/image-syntax";
import { config } from "./core/config";

/**
 * 在 Live Preview 下，「未成组」的图片 embed 会显示原生的 edit-block-button。
 * 本模块在该按钮左侧注入一个 Group 按钮（放进同一个新的 flex 容器），
 * 点击后将该图片所在行包装成 ```imgs 代码块。
 *
 * Group 按钮与原生 edit-block-button 共用同一套 hover 触发 CSS（见 styles.css），
 * 因此只需在 DOM 中注入一次，显示/隐藏完全交给 CSS，无需额外的定位或计时器逻辑。
 */
export function registerHoverGroupTrigger(plugin: ImgRowPlugin) {
    // 记录已注入过 Group 按钮的 embed 容器，避免重复注入
    const injected = new WeakSet<HTMLElement>();

    const isEligibleImage = (target: EventTarget | null): target is HTMLImageElement => {
        if (!(target instanceof HTMLImageElement)) return false;
        if (!target.closest(".cm-content")) return false; // 仅 Live Preview
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    const convertImageToGroup = (img: HTMLImageElement) => {
        const editorRoot = img.closest(".cm-editor") as HTMLElement | null;
        const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
        if (!view) return;

        const pos = view.posAtDOM(img);
        const line = view.state.doc.lineAt(pos);
        if (!hasMarkdownImage(line.text)) return;

        const prevLineText = line.number > 1 ? view.state.doc.line(line.number - 1).text : "";
        const paddingLeft = isListLine(prevLineText) ? config.LIST_INDENT_PX : 0;
        const wrapped = imgsWrapper(getImageSyntaxes(line.text), paddingLeft);

        view.dispatch({ changes: { from: line.from, to: line.to, insert: wrapped } });
    };

    // 将 Group 按钮与原生 edit-block-button 一起移入新的 wrap 容器，
    // 放在 embed 内 edit-block-button 原来的位置
    const injectGroupButton = (img: HTMLImageElement) => {
        const embed = img.closest<HTMLElement>(".internal-embed");
        if (!embed || injected.has(embed)) return;
        const editBtn = embed.querySelector<HTMLElement>(":scope > .edit-block-button");
        if (!editBtn) return;

        const wrap = embed.ownerDocument.createElement("div");
        wrap.className = "plugin-image-hover-group-wrap";

        const btn = embed.ownerDocument.createElement("div");
        btn.className = "plugin-image-hover-group-btn";
        btn.setAttribute("aria-label", "Group image");

        const iconEl = embed.ownerDocument.createElement("span");
        iconEl.className = "plugin-image-hover-group-btn-icon";
        setIcon(iconEl, "images");
        btn.appendChild(iconEl);

        const labelEl = embed.ownerDocument.createElement("span");
        labelEl.className = "plugin-image-hover-group-btn-label";
        labelEl.setText("Group");
        btn.appendChild(labelEl);

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            convertImageToGroup(img);
        });

        embed.insertBefore(wrap, editBtn);
        wrap.appendChild(btn);
        wrap.appendChild(editBtn);

        injected.add(embed);
    };

    plugin.registerDomEvent(document, "mouseover", (e: MouseEvent) => {
        if (!plugin.settings.enableHoverGroupButton) return;
        if (isEligibleImage(e.target)) injectGroupButton(e.target);
    });
}
