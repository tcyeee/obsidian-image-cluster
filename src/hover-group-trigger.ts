import ImgRowPlugin from "main";
import { setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import { getImageSyntaxes, hasMarkdownImage, imgsWrapper, isListLine } from "./markdown/image-syntax";
import { config } from "./core/config";

/**
 * 在 Live Preview 下，「未成组」的图片 embed（div.image-embed）在获得焦点
 * （:focus-within）时会显示原生的 edit-block-button。
 * 本模块在该按钮左侧注入一个 Group 按钮（放进同一个新的 flex 容器），
 * 点击后将该图片所在行包装成 ```imgs 代码块。
 *
 * Group 按钮与原生 edit-block-button 共用同一套 focus-within 触发 CSS（见 styles.css），
 * 因此只需在 DOM 中注入一次，显示/隐藏完全交给 CSS，无需额外的定位或计时器逻辑。
 */
export function registerHoverGroupTrigger(plugin: ImgRowPlugin) {
    // 记录已注入过 Group 按钮的 embed 容器，避免重复注入
    const injected = new WeakSet<HTMLElement>();

    // target 用 Node（而不是 EventTarget）承接，配合下面的 .instanceOf() 做跨窗口安全的类型判断——
    // 见 maybeInject 的调用方，传入的是 UIEvent.targetNode 而非裸的 e.target。
    const isEligibleImage = (target: Node | null): target is HTMLImageElement => {
        if (!target || !target.instanceOf(HTMLImageElement)) return false;
        if (!target.closest(".cm-content")) return false; // 仅 Live Preview
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    // 从事件目标解析出待处理的图片：既支持 mouseover（target 是 <img>），
    // 也支持 focusin（target 是可聚焦的 .internal-embed 容器本身）
    const resolveEligibleImage = (target: Node | null): HTMLImageElement | null => {
        if (isEligibleImage(target)) return target;
        if (target && target.instanceOf(Element)) {
            const embed = target.closest<HTMLElement>(".internal-embed.image-embed");
            const img = embed?.querySelector("img") ?? null;
            if (isEligibleImage(img)) return img;
        }
        return null;
    };

    const convertImageToGroup = (img: HTMLImageElement) => {
        const editorRoot = img.closest<HTMLElement>(".cm-editor");
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

        const btn = embed.ownerDocument.createElement("button");
        btn.type = "button";
        btn.className = "plugin-image-hover-group-btn";
        btn.setAttribute("aria-label", "Group image");

        const iconEl = embed.ownerDocument.createElement("span");
        iconEl.className = "plugin-image-hover-group-btn-icon";
        setIcon(iconEl, "layout-grid");
        btn.appendChild(iconEl);

        // 阻止 mousedown 冒泡到 CM6 编辑器，避免其自身的点击-定位光标逻辑
        // 抢在我们的 click 监听器之前处理这次交互（曾导致按钮点击无响应）
        btn.addEventListener("mousedown", (e) => e.stopPropagation());
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

    const maybeInject = (target: Node | null) => {
        if (!plugin.settings.enableHoverGroupButton) return;
        const img = resolveEligibleImage(target);
        if (img) injectGroupButton(img);
    };

    // mouseover：鼠标划过图片时注入；focusin：点击/键盘聚焦 embed 时注入，
    // 保证按钮在 embed 获得焦点（原生 edit 按钮出现的时机）前已存在于 DOM。
    // 用 e.targetNode（Obsidian 对 UIEvent 的跨窗口安全扩展）而不是裸的 e.target，
    // 这样它的类型是 Node，可以直接配合 .instanceOf() 做跨窗口安全的类型判断。
    plugin.registerDomEvent(activeDocument, "mouseover", (e: MouseEvent) => maybeInject(e.targetNode));
    plugin.registerDomEvent(activeDocument, "focusin", (e: FocusEvent) => maybeInject(e.targetNode));
}
