import ImgRowPlugin from "main";
import { setIcon, setTooltip } from "obsidian";
import { EditorView } from "@codemirror/view";
import { buildGroupBlockForLine } from "./markdown/image-syntax";
import { t } from "./i18n";

/**
 * 在 Live Preview 下，「未成组」的图片 embed（div.image-embed）悬停 / 选中时，
 * Obsidian 会显示一排原生操作按钮（放大、编辑源码）。
 * 本模块往这排按钮里插入一个 Group 按钮，点击后把该图片所在行包装成 ```imgs 代码块。
 *
 * Obsidian 1.13 起，这排按钮的结构是：
 *   div.image-embed
 *   └── div.embed-actions            ← 绝对定位 + 毛玻璃背景板，widget 建 DOM 时就创建
 *       ├── div.embed-action         （lucide-zoom-in，仅桌面端）
 *       └── div.embed-action.edit-block-button
 * 显示条件由官方 CSS 负责：`.image-embed:hover` 或 `.image-embed.is-selected` 时
 * 整个 .embed-actions 淡入；图片宽度 < 80px 时官方会加 .no-hover-actions 强制隐藏。
 *
 * 因此这里只把按钮做成一个普通的 div.embed-action 插进去即可——定位、淡入、hover 高亮、
 * 背景板、移动端尺寸全部继承官方样式，插件侧不需要再写任何显示/定位 CSS。
 */
export function registerHoverGroupTrigger(plugin: ImgRowPlugin) {
    // 记录已注入过 Group 按钮的 .embed-actions 容器，避免重复注入。
    // 图片 widget 是 noReuse 的，重新渲染会换一个全新的 embed-actions 元素，
    // 因此 WeakSet 天然随之失效，不会漏掉重建后的容器。
    const injected = new WeakSet<HTMLElement>();

    // target 用 Node（而不是 EventTarget）承接，配合下面的 .instanceOf() 做跨窗口安全的类型判断——
    // 见 maybeInject 的调用方，传入的是 UIEvent.targetNode 而非裸的 e.target。
    // 同时接受 <img>（图片 embed）与 <video>（视频 embed，Obsidian 渲染为
    // .internal-embed.media-embed.video-embed > video），两者都可以被转成图片组。
    const isEligibleImage = (target: Node | null): target is HTMLImageElement | HTMLVideoElement => {
        if (!target || (!target.instanceOf(HTMLImageElement) && !target.instanceOf(HTMLVideoElement))) return false;
        // 仅 Live Preview 正文内；顺带排除 1.13 新增的 .cm-image-reveal-tooltip（图片放大浮层），
        // 它同样渲染 .image-embed，但不在 .cm-content 里
        if (!target.closest(".cm-content")) return false;
        if (target.closest(".plugin-image-wrapper")) return false; // 已经是图片组，跳过
        return true;
    };

    // 从事件目标解析出待处理的图片/视频：既支持 mouseover（target 是 <img>/<video>），
    // 也支持 focusin（target 是可聚焦的 .image-embed / .video-embed 容器本身）。
    // 用 .image-embed / .video-embed 而不是 .internal-embed：前两者同时覆盖
    // ![[wiki]] 与 ![](path) 两种写法，.internal-embed 这个基类选择范围太宽。
    const resolveEligibleImage = (target: Node | null): HTMLImageElement | HTMLVideoElement | null => {
        if (isEligibleImage(target)) return target;
        if (target && target.instanceOf(Element)) {
            const embed = target.closest<HTMLElement>(".image-embed, .video-embed");
            const media = embed?.querySelector("img, video") ?? null;
            if (isEligibleImage(media)) return media;
        }
        return null;
    };

    const convertImageToGroup = (img: HTMLImageElement | HTMLVideoElement) => {
        const editorRoot = img.closest<HTMLElement>(".cm-editor");
        const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null;
        if (!view) return;

        const pos = view.posAtDOM(img);
        const line = view.state.doc.lineAt(pos);
        const prevLineText = line.number > 1 ? view.state.doc.line(line.number - 1).text : "";
        const wrapped = buildGroupBlockForLine(line.text, prevLineText);
        if (!wrapped) return;

        view.dispatch({ changes: { from: line.from, to: line.to, insert: wrapped } });
    };

    const injectGroupButton = (img: HTMLImageElement | HTMLVideoElement) => {
        const embed = img.closest<HTMLElement>(".image-embed, .video-embed");
        if (!embed) return;

        let actionsEl = embed.querySelector<HTMLElement>(":scope > .embed-actions");
        if (!actionsEl) {
            // 图片 embed：.embed-actions 由官方在 widget 建 DOM 时就创建，这里拿不到
            // 说明时机太早，直接放弃本次（不记进 injected），下一次 mouseover 会再试——
            // 如果现在自己补建一个，官方随后创建自己的容器时就会出现两个 .embed-actions。
            //
            // 视频 embed：官方的 CM6 widget 分支里，视频走的是纯 hookClickHandler，
            // 从不调用 addEditButton/addActions，永远不会自己创建 .embed-actions，
            // 必须由插件补建，否则按钮永远没地方插。class 名对了，官方通用的定位/
            // opacity 过渡 CSS，以及本插件给 .video-embed 补的 hover 淡入 CSS
            // （见 styles.css）都会按选择器自动生效，不需要再管定位。
            if (!embed.hasClass("video-embed")) return;
            actionsEl = embed.createDiv({ cls: "embed-actions" });
        }
        if (injected.has(actionsEl)) return;

        // embed-action：官方按钮样式（尺寸、圆角、hover 高亮、移动端放大）
        const btn = createDiv({ cls: "embed-action plugin-image-group-action" });
        setIcon(btn, "lucide-layout-grid");
        setTooltip(btn, t.common.groupImages);

        // 阻止 mousedown 冒泡到 CM6 编辑器，避免其自身的点击-定位光标逻辑
        // 抢在我们的 click 监听器之前处理这次交互（曾导致按钮点击无响应）
        btn.addEventListener("mousedown", (e) => e.stopPropagation());
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            convertImageToGroup(img);
        });

        // 放在「编辑源码」按钮左侧，保持和旧版一致的相对位置；
        // 官方哪天不再渲染该按钮时退化为追加到末尾
        const editBtn = actionsEl.querySelector<HTMLElement>(":scope > .edit-block-button");
        if (editBtn) actionsEl.insertBefore(btn, editBtn);
        else actionsEl.appendChild(btn);

        injected.add(actionsEl);
    };

    const maybeInject = (target: Node | null) => {
        if (!plugin.settings.enableHoverGroupButton) return;
        const img = resolveEligibleImage(target);
        if (img) injectGroupButton(img);
    };

    // mouseover：鼠标划过图片时注入；focusin：键盘/程序聚焦 embed（tabindex=-1）时注入，
    // 保证按钮在 .embed-actions 淡入之前已经在 DOM 里。
    // 用 e.targetNode（Obsidian 对 UIEvent 的跨窗口安全扩展）而不是裸的 e.target，
    // 这样它的类型是 Node，可以直接配合 .instanceOf() 做跨窗口安全的类型判断。
    plugin.registerDomEvent(activeDocument, "mouseover", (e: MouseEvent) => maybeInject(e.targetNode));
    plugin.registerDomEvent(activeDocument, "focusin", (e: FocusEvent) => maybeInject(e.targetNode));
}
