import ImgRowPlugin from "main";
import { setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import { getImageSyntaxes, hasMarkdownImage, imgsWrapper, isListLine } from "./markdown/image-syntax";
import { config } from "./core/config";

/**
 * 在 Live Preview 下，鼠标悬停在「未成组」的图片右上角时浮现一个按钮，
 * 点击后将该图片所在行包装成 ```imgs 代码块。
 *
 * 用 CM6 公开 API（EditorView.findFromDOM / posAtDOM / dispatch）把悬停的
 * <img> DOM 节点映射回文档位置并直接编辑，不依赖右键菜单，避免和其他
 * 插件的图片右键菜单相互冲突。
 */
export function registerHoverGroupTrigger(plugin: ImgRowPlugin) {
    let activeImg: HTMLImageElement | null = null;
    let activeBtn: HTMLElement | null = null;
    let hideTimer: number | null = null;

    const clearHideTimer = () => {
        if (hideTimer === null) return;
        activeImg?.ownerDocument.defaultView?.clearTimeout(hideTimer);
        hideTimer = null;
    };

    const removeBtn = () => {
        clearHideTimer();
        activeBtn?.remove();
        activeBtn = null;
        activeImg = null;
    };

    const scheduleRemove = () => {
        clearHideTimer();
        const win = activeImg?.ownerDocument.defaultView ?? window;
        hideTimer = win.setTimeout(removeBtn, 200);
    };

    const isEligibleImage = (target: EventTarget | null): target is HTMLImageElement => {
        if (!(target instanceof HTMLImageElement)) return false;
        if (!target.closest(".cm-content")) return false; // 仅 Live Preview
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    const positionBtn = (btn: HTMLElement, img: HTMLImageElement) => {
        const rect = img.getBoundingClientRect();
        const winWidth = img.ownerDocument.defaultView?.innerWidth ?? rect.right;
        btn.style.top = `${rect.top + 4}px`;
        btn.style.right = `${winWidth - rect.right + 4}px`;
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

    const showBtnFor = (img: HTMLImageElement) => {
        if (activeImg === img) {
            clearHideTimer();
            return;
        }
        removeBtn();
        activeImg = img;

        const btn = img.ownerDocument.createElement("div");
        btn.className = "plugin-image-hover-group-btn";
        btn.setAttribute("aria-label", "Group image");

        const iconEl = img.ownerDocument.createElement("span");
        iconEl.className = "plugin-image-hover-group-btn-icon";
        setIcon(iconEl, "images");
        btn.appendChild(iconEl);

        const labelEl = img.ownerDocument.createElement("span");
        labelEl.className = "plugin-image-hover-group-btn-label";
        labelEl.setText("Group");
        btn.appendChild(labelEl);

        img.ownerDocument.body.appendChild(btn);
        activeBtn = btn;
        positionBtn(btn, img);

        btn.addEventListener("mouseenter", clearHideTimer);
        btn.addEventListener("mouseleave", scheduleRemove);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            convertImageToGroup(img);
            removeBtn();
        });
    };

    plugin.registerDomEvent(document, "mouseover", (e: MouseEvent) => {
        if (!plugin.settings.enableHoverGroupButton) return;
        if (isEligibleImage(e.target)) showBtnFor(e.target);
    });

    plugin.registerDomEvent(document, "mouseout", (e: MouseEvent) => {
        if (e.target !== activeImg) return;
        const related = e.relatedTarget as Node | null;
        if (related && activeBtn && (related === activeBtn || activeBtn.contains(related))) return;
        scheduleRemove();
    });

    // 原生拖拽开始后浏览器会停止派发常规的 mouseover/mouseout，
    // 依赖它们的隐藏逻辑（scheduleRemove）不会被触发；如果被拖走的正是
    // 当前显示按钮的图片（例如拖入某个图片组），松手后该 <img> 会被移除，
    // 而按钮是单独 append 到 document.body 的固定定位元素，不会随之消失，
    // 于是残留悬浮在原来的位置。这里在拖拽一开始就主动移除按钮。
    plugin.registerDomEvent(document, "dragstart", (e: DragEvent) => {
        if (e.target === activeImg) removeBtn();
    });

    // 滚动时按钮位置会脱节，直接隐藏；下次悬停再重新出现
    plugin.registerDomEvent(document, "scroll", () => removeBtn(), { capture: true });

    plugin.register(removeBtn);
}
