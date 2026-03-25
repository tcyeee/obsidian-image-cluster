import ImgRowPlugin from "main";
import { setCssProps, parseStyleOptions, md5, ensureThumbnailForFile } from "src/utils";
import { createImageContainerElement, createSettingButtonElement, createSettingPanelDom, createErrorDiv } from "src/ui";
import { SettingOptions as SettingOptions, SettingPanelDom } from "./domain";
import { MarkdownPostProcessorContext, TFile, normalizePath } from "obsidian";
import { config } from "./config";

// 关联每个图片容器与其设置面板中的 limit 复选框，供蒙版点击时直接同步 UI 状态
const containerLimitCheckboxMap = new WeakMap<HTMLDivElement, HTMLInputElement>();

/**
 * 自动解析imgs代码块
 * 当解析到imgs代码块时，会自动创建一个图片容器，并应用对应的配置。
 */
export function addImageLayoutMarkdownProcessor(plugin: ImgRowPlugin) {
    plugin.registerMarkdownCodeBlockProcessor("imgs", (source, el, ctx) => {
        const option = parseStyleOptions(source);
        const container = createContainer(option, plugin, ctx, el);

        const lines = source.split("\n");
        // 用于大图预览的原图地址列表
        const srcList: string[] = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            // 同时支持标准 Markdown 格式 ![alt](path) 和 Obsidian 内部链接 ![[path]]
            const mdMatch = /!\[.*?\]\((.*?)\)/.exec(trimmedLine);
            const wikiMatch = /!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/.exec(trimmedLine);
            const rawPath = mdMatch ? mdMatch[1] : wikiMatch ? wikiMatch[1].trim() : null;
            if (rawPath !== null) {
                const decodedPath = decodeURIComponent(rawPath);
                const file =
                    plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, ctx.sourcePath) ??
                    plugin.app.vault.getFiles().find((f: TFile) => f.path.endsWith(decodedPath));
                if (file) {
                    // 原图 resource 路径（用于点击后的大图预览）
                    const originalSrc = plugin.app.vault.getResourcePath(file);
                    const imgIdx = srcList.length;
                    srcList.push(originalSrc);

                    // 缩略图路径（相对于 vault 根目录）
                    // 使用源文件路径的 MD5 作为文件名，且不带扩展名：
                    // <THUMBNAIL_PATH>/<md5(file.path)>
                    // 例如：THUMBNAIL_PATH="assets/cache/"，原图为 "assets/1.png"
                    // 最终缩略图写入路径为 "assets/cache/<md5>"
                    const thumbKey = md5(file.path);
                    const thumbPath = normalizePath(`${config.THUMBNAIL_PATH}${thumbKey}`);
                    // 缩略图文件对象

                    const thumbFile = plugin.app.vault.getAbstractFileByPath(thumbPath);
                    // 缩略图资源路径
                    const thumbSrc = thumbFile instanceof TFile
                        ? plugin.app.vault.getResourcePath(thumbFile)
                        : originalSrc;

                    // 列表中展示缩略图，点击后仍然使用 srcList 中的原图
                    const imgEl = createImage(option, thumbSrc, srcList, imgIdx);
                    const wrapper = document.createElement("div");
                    wrapper.classList.add("plugin-image-wrapper");
                    wrapper.dataset.imgLine = line.trim(); // 保存原始 markdown 行，供拖拽排序写回使用
                    wrapper.appendChild(imgEl);
                    container.appendChild(wrapper);

                    // 如果当前还没有缩略图，则在后台异步生成一份，并在生成后刷新当前 img 的 src
                    if (!(thumbFile instanceof TFile)) {
                        void ensureThumbnailForFile(plugin, file, thumbPath, imgEl);
                    }
                } else {
                    // 如果图片不存在，则在对应位置插入错误图标
                    container.appendChild(createErrorDiv(option));
                }
            }
        }
        // 先挂载到文档，再应用配置（包括 limit 逻辑），避免初次渲染时拿不到正确宽度
        el.appendChild(container);
        // 将当前配置应用到容器中的所有图片（支持后续面板动态更新）
        // 这里传入一个简单的「立即持久化」回调，供后续点击「+N」蒙版时使用：
        // 当用户通过点击蒙版关闭 limit 限制时，会调用该回调把最新配置写回到代码块配置行。
        applySettingsToContainer(container, option, () => {
            void persistOptionsToSource(option, plugin, ctx, el);
        });

        // 编辑模式（Live Preview）：el 在处理器回调时尚未挂入 DOM，
        // 用 requestAnimationFrame 等待挂载完成后，再将 setting wrapper 移入
        // .cm-preview-code-block，放在原生 edit-block-button 的左侧。
        requestAnimationFrame(() => {
            const codeBlock = el.closest('.cm-preview-code-block');
            const settingWrapper = container.querySelector<HTMLElement>('.plugin-image-setting-outer');
            if (codeBlock && settingWrapper) {
                const editBtn = codeBlock.querySelector('.edit-block-button');
                if (editBtn) {
                    codeBlock.insertBefore(settingWrapper, editBtn);
                } else {
                    codeBlock.appendChild(settingWrapper);
                }
                // 编辑模式下启用图片拖拽排序
                enableDragSort(container, plugin, ctx, el);
            }
        });
    });
}

/**
 * 创建图片组中的单个图片元素，并应用对应的配置。
 * 
 * @param option - 配置对象
 * @param src - 图片源
 * @param srcList - 图片列表
 * @param idx - 图片索引
 * @returns 图片元素
 */
function createImage(option: SettingOptions, src: string, srcList?: string[], idx?: number): HTMLImageElement {
    const img = document.createElement("img");
    img.src = src;
    img.classList.add("plugin-image");
    img.style.setProperty("--plugin-image-size", `${option.size}px`);
    img.style.setProperty("--plugin-image-radius", `${option.radius}px`);

    const openOverlay = () => {
        let curIdx = idx || 0;
        const overlay = document.createElement("div");
        overlay.classList.add("plugin-image-overlay");

        const largeImg = document.createElement("img");
        largeImg.src = srcList?.[curIdx] || src;
        largeImg.classList.add("plugin-image-large");

        // 长截图自适应：高宽比 > 2 时切换为可滚动模式，以宽度为基准展示
        const applyTallMode = () => {
            const ratio = largeImg.naturalHeight / largeImg.naturalWidth;
            if (ratio > 2.0) {
                largeImg.classList.add("plugin-image-large--tall");
                overlay.classList.add("plugin-image-overlay--scrollable");
            } else {
                largeImg.classList.remove("plugin-image-large--tall");
                overlay.classList.remove("plugin-image-overlay--scrollable");
            }
        };
        largeImg.addEventListener("load", applyTallMode);
        if (largeImg.complete && largeImg.naturalWidth > 0) applyTallMode();

        const prevBtn = document.createElement("button");
        prevBtn.textContent = "←";
        prevBtn.className = "plugin-image-nav-btn plugin-image-nav-btn-prev";
        const nextBtn = document.createElement("button");
        nextBtn.textContent = "→";
        nextBtn.className = "plugin-image-nav-btn plugin-image-nav-btn-next";

        let scale = 1;
        let tx = 0; // 拖拽平移 X
        let ty = 0; // 拖拽平移 Y

        const applyTransform = () => {
            setCssProps(largeImg, { transform: `translate(${tx}px, ${ty}px) scale(${scale})` });
        };

        // 滚轮缩放（passive: false 使 preventDefault 生效，阻止 overlay 滚动）
        largeImg.addEventListener("wheel", e => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY;
            if (delta < 0) {
                scale = Math.min(config.PREVIEW_MAX_SCALE, scale + 0.1);
            } else {
                scale = Math.max(config.PREVIEW_MIN_SCALE, scale - 0.1);
            }
            applyTransform();
        }, { passive: false });

        // 拖拽平移（鼠标，桌面端）
        let isDragging = false;
        let wasDragged = false; // 用于区分拖拽和点击，避免拖拽结束时误关闭预览
        let dragStartX = 0;
        let dragStartY = 0;

        largeImg.addEventListener("mousedown", e => {
            isDragging = true;
            wasDragged = false;
            dragStartX = e.clientX - tx;
            dragStartY = e.clientY - ty;
            setCssProps(largeImg, { cursor: "grabbing" });
            e.preventDefault();
        });

        overlay.addEventListener("mousemove", e => {
            if (!isDragging) return;
            tx = e.clientX - dragStartX;
            ty = e.clientY - dragStartY;
            wasDragged = true;
            applyTransform();
        });

        overlay.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                setCssProps(largeImg, { cursor: "grab" });
            }
        });

        overlay.addEventListener("mouseleave", () => {
            isDragging = false;
        });

        // ---- 触摸事件（移动端） ----
        // 单指拖拽平移 + 双指捏合缩放
        let lastPinchDist = 0;

        largeImg.addEventListener("touchstart", e => {
            if (e.touches.length !== 1) return;
            isDragging = true;
            wasDragged = false;
            dragStartX = e.touches[0].clientX - tx;
            dragStartY = e.touches[0].clientY - ty;
            e.preventDefault(); // 阻止滚动
        }, { passive: false });

        overlay.addEventListener("touchmove", e => {
            e.preventDefault(); // 阻止 overlay 自身滚动
            if (e.touches.length === 2) {
                // 双指捏合缩放
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
                if (lastPinchDist > 0) {
                    scale = Math.min(config.PREVIEW_MAX_SCALE, Math.max(config.PREVIEW_MIN_SCALE, scale * (dist / lastPinchDist)));
                    applyTransform();
                }
                lastPinchDist = dist;
                isDragging = false; // 双指期间取消单指拖拽
            } else if (e.touches.length === 1 && isDragging) {
                tx = e.touches[0].clientX - dragStartX;
                ty = e.touches[0].clientY - dragStartY;
                wasDragged = true;
                applyTransform();
            }
        }, { passive: false });

        overlay.addEventListener("touchend", e => {
            if (e.touches.length < 2) lastPinchDist = 0;
            if (isDragging) {
                isDragging = false;
                return; // 拖拽结束，不关闭
            }
            if (wasDragged) {
                wasDragged = false;
                return; // 拖拽后抬手，不关闭
            }
            // 点击背景（非图片区域）关闭预览
            if (e.target === overlay) {
                e.preventDefault();
                closePreview();
            }
        });

        // 切换图片函数（带方向滑动动画）
        const ANIM_MS = 220;
        let isAnimating = false;

        const switchTo = (newIdx: number, direction: "next" | "prev") => {
            if (!srcList || isAnimating) return;
            isAnimating = true;

            const exitX = direction === "next" ? -140 : 140;  // 当前图片滑出方向
            const enterX = direction === "next" ? 140 : -140; // 新图片进入起始位置

            // 阶段一：当前图片滑出 + 淡出
            setCssProps(largeImg, { transition: `transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease` });
            setCssProps(largeImg, { transform: `translate(${exitX}px, 0) scale(${scale})` });
            setCssProps(largeImg, { opacity: "0" });

            setTimeout(() => {
                // 阶段二：切换图源，瞬间移到入场起始位置（不触发 transition）
                curIdx = newIdx;
                largeImg.src = srcList[curIdx];
                scale = 1; tx = 0; ty = 0;
                overlay.scrollTop = 0;

                setCssProps(largeImg, { transition: "none" });
                setCssProps(largeImg, { transform: `translate(${enterX}px, 0) scale(1)` });
                setCssProps(largeImg, { opacity: "0" });

                // 阶段三：滑入 + 淡入（两次 rAF 确保浏览器先处理 transition:none）
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setCssProps(largeImg, { transition: `transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease` });
                        setCssProps(largeImg, { transform: "translate(0, 0) scale(1)" });
                        setCssProps(largeImg, { opacity: "1" });

                        setTimeout(() => {
                            largeImg.style.removeProperty("transition"); // 还原 CSS 默认 transition
                            isAnimating = false;
                        }, ANIM_MS);
                    });
                });

                updateBtnState();
            }, ANIM_MS);
        };
        prevBtn.onclick = () => {
            if (srcList && curIdx > 0) switchTo(curIdx - 1, "prev");
        };
        nextBtn.onclick = () => {
            if (srcList && curIdx < srcList.length - 1) switchTo(curIdx + 1, "next");
        };
        function updateBtnState() {
            if (!srcList) return;
            prevBtn.disabled = curIdx === 0;
            nextBtn.disabled = curIdx === srcList.length - 1;
        }
        if (srcList && srcList.length > 1) {
            overlay.appendChild(prevBtn);
            overlay.appendChild(nextBtn);
        }
        updateBtnState();

        overlay.appendChild(largeImg);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.classList.add("plugin-image-overlay-visible");
        });
        // 鼠标点击背景关闭（桌面端）
        overlay.addEventListener("click", (event) => {
            // 拖拽结束时会触发 click，用 wasDragged 过滤掉
            if (wasDragged) { wasDragged = false; return; }
            if (event.target === overlay) closePreview();
        });
        // 支持左右方向键切换
        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closePreview();
            if (srcList && srcList.length > 1 && overlay.parentNode) {
                if (event.key === "ArrowLeft" && curIdx > 0) {
                    switchTo(curIdx - 1, "prev");
                }
                if (event.key === "ArrowRight" && curIdx < srcList.length - 1) {
                    switchTo(curIdx + 1, "next");
                }
            }
        };
        document.addEventListener("keydown", handleKeydown);
        function closePreview() {
            overlay.classList.remove("plugin-image-overlay-visible");
            setTimeout(() => { overlay.remove() }, 300);
            document.removeEventListener("keydown", handleKeydown);
        }
    };

    // 桌面端：鼠标点击打开预览
    img.addEventListener("click", openOverlay);
    // 移动端：touchend 打开预览
    // 记录 touchstart 坐标，在 touchend 时判断位移是否超过阈值：
    // 超过则认为是滑动手势，不打开预览，避免页面滚动时误触图片。
    let touchStartX = 0;
    let touchStartY = 0;
    img.addEventListener("touchstart", e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    img.addEventListener("touchend", e => {
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dx > 10 || dy > 10) return; // 位移过大，判定为滑动，忽略
        e.stopPropagation();
        e.preventDefault();
        openOverlay();
    }, { passive: false });

    return img;
}


/**
 * 创建图片容器及右上角的设置面板。
 * 面板中的控件会和传入的 SettingOptions 进行绑定，并在修改时写回到 Markdown 源码。
 * 
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 * @returns 图片容器
 */
export function createContainer(option: SettingOptions, plugin: ImgRowPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement): HTMLDivElement {
    const container = createImageContainerElement(option);

    // 外层包装：统一承载 setting 按钮 + 面板，便于整体迁移到 .cm-preview-code-block
    const settingWrapper = document.createElement("div");
    settingWrapper.className = "plugin-image-setting-outer";
    container.appendChild(settingWrapper);

    const settingBtn = createSettingButtonElement();
    settingWrapper.appendChild(settingBtn);

    // 为每个容器生成独立的 radio 分组名，避免多个代码块之间互相影响
    const sizeGroupName = `imgs-size-${Math.random().toString(36).slice(2, 8)}`;

    // setting 面板由 setupSettingPanel 创建；
    // 挂到 document.body 以彻底脱离 CodeMirror 渲染树，
    // 避免祖先元素的 transform/will-change 干扰 position:fixed 定位
    const { panel, persistIfNeeded, limitCheckbox } = setupSettingPanel(option, plugin, ctx, el, container, sizeGroupName);
    document.body.appendChild(panel);
    // 关联 limitCheckbox，供蒙版点击时同步 UI 状态
    if (limitCheckbox) containerLimitCheckboxMap.set(container, limitCheckbox);

    const isPanelOpen = () => panel.classList.contains("plugin-image-setting-panel--open");
    const openPanel = () => {
        // 根据按钮当前的视口坐标动态定位面板
        const rect = settingWrapper.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 4}px`;
        panel.style.right = `${window.innerWidth - rect.right}px`;
        panel.classList.add("plugin-image-setting-panel--open");
    };
    const closePanel = () => {
        if (!isPanelOpen()) return;
        persistIfNeeded();
        panel.classList.remove("plugin-image-setting-panel--open");
    };

    // setting按钮点击显示/隐藏面板
    settingBtn.onclick = (e) => {
        e.stopPropagation();
        if (isPanelOpen()) { closePanel(); } else { openPanel(); }
    };

    // 点击 wrapper 或 panel 之外时自动关闭（panel 已移至 body，需单独判断）
    // 使用 AbortController 以便在容器销毁时移除监听器，避免泄漏
    const clickAbortCtrl = new AbortController();
    document.addEventListener("click", (e: MouseEvent) => {
        // 容器已从 DOM 中移除时，顺带清理 panel 和监听器
        if (!container.isConnected) {
            panel.remove();
            clickAbortCtrl.abort();
            return;
        }
        const target = e.target;
        if (!(target instanceof Node)) return;
        if (!settingWrapper.contains(target) && !panel.contains(target)) {
            closePanel();
        }
    }, { signal: clickAbortCtrl.signal });
    // 插件卸载时清理挂在 document.body 上的浮动面板和事件监听器
    plugin.register(() => {
        panel.remove();
        clickAbortCtrl.abort();
    });

    // 安全区域：面板顶部透明块，覆盖按钮与面板之间的间隙，防止鼠标经过间隙时面板提前消失
    const safeZone = document.createElement("div");
    safeZone.classList.add("plugin-image-panel-safe-zone");
    panel.appendChild(safeZone);

    // 鼠标移入/移出图片容器：控制阅读模式下按钮的可见性
    // 编辑模式下 wrapper 已迁移到 .cm-preview-code-block，由 CSS :hover 控制可见性
    container.addEventListener("mouseenter", () => {
        settingBtn.classList.add("plugin-image-setting-btn-container--visible");
    });
    container.addEventListener("mouseleave", (e: MouseEvent) => {
        settingBtn.classList.remove("plugin-image-setting-btn-container--visible");
        // 如果鼠标移入了面板（含安全区域），不关闭面板
        if (container.contains(settingWrapper) && panel.contains(e.relatedTarget as Node)) return;
        closePanel();
    });

    // 鼠标离开面板（含安全区域）时关闭
    panel.addEventListener("mouseleave", (e: MouseEvent) => {
        // 如果鼠标回到了容器（按钮区域），由容器的 mouseleave 逻辑决定是否关闭
        if (container.contains(e.relatedTarget as Node)) return;
        closePanel();
    });

    return container;
}

/**
 * 创建并初始化 setting 面板，包括：
 * - DOM 结构（尺寸单选 + 边框/阴影勾选）
 * - 根据当前配置设置初始勾选状态
 * - 绑定变更事件并在需要时触发持久化
 * 
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 * @param container - 图片容器
 * @param sizeGroupName - 尺寸单选组名
 * @returns 设置面板
 *   { panel: HTMLDivElement; persistIfNeeded: () => void; limitCheckbox: HTMLInputElement | null }
 *     panel: 设置面板
 *     persistIfNeeded: 持久化函数 （在需要时将更改写回到对应 Markdown 文件）
 *     limitCheckbox: limit 复选框元素（供外部同步 UI 状态）
 */
function setupSettingPanel(
    option: SettingOptions,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    container: HTMLDivElement,
    sizeGroupName: string,
): { panel: HTMLDivElement; persistIfNeeded: () => void; limitCheckbox: HTMLInputElement | null } {
    const { panel, borderCheckbox, shadowCheckbox, hiddenCheckbox, limitCheckbox, sizeRadios }: SettingPanelDom = createSettingPanelDom(sizeGroupName);

    // 注意：panel 的 DOM 挂载由调用方（createContainer）负责

    // 根据当前的配置初始化面板勾选状态
    if (borderCheckbox) borderCheckbox.checked = option.border;
    if (shadowCheckbox) shadowCheckbox.checked = option.shadow;
    if (hiddenCheckbox) hiddenCheckbox.checked = option.hidden;
    if (limitCheckbox) limitCheckbox.checked = option.limit;
    // 根据当前 size 推断 S / M / L
    const currentSize = option.size;
    const pickSizeLabel = currentSize <= config.SMALL_SIZE ? "small" : currentSize <= config.MEDIUM_SIZE ? "medium" : "large";
    sizeRadios.forEach((radio) => {
        if (radio.dataset.size === pickSizeLabel) {
            radio.checked = true;
        }
    });
    const sizeGroupEl = panel.querySelector<HTMLDivElement>(".plugin-image-setting-size-group");
    if (sizeGroupEl) sizeGroupEl.dataset.size = pickSizeLabel;

    // 标记当前面板中的设置是否有尚未写回文件的更改
    let hasPendingChanges = false;

    // 在需要时将更改写回到对应 Markdown 文件（例如关闭面板时）
    const persistIfNeeded = () => {
        if (!hasPendingChanges) return;
        hasPendingChanges = false;
        void persistOptionsToSource(option, plugin, ctx, el);
    };

    // 绑定事件：勾选框/单选按钮改变时，实时更新配置并作用到当前容器（但先不立刻写文件）
    borderCheckbox?.addEventListener("change", () => {
        option.border = !!borderCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    shadowCheckbox?.addEventListener("change", () => {
        option.shadow = !!shadowCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    hiddenCheckbox?.addEventListener("change", () => {
        option.hidden = !!hiddenCheckbox.checked;
        applySettingsToContainer(container, option);
        hasPendingChanges = true;
    });
    limitCheckbox?.addEventListener("change", () => {
        option.limit = !!limitCheckbox.checked;
        // 应用到当前容器，同时为「+N」蒙版提供一个简单的持久化回调：
        // 当用户点击蒙版关闭 limit 时，会调用该回调，把最新配置写回到代码块配置行。
        applySettingsToContainer(container, option, () => {
            void persistOptionsToSource(option, plugin, ctx, el);
        });
        // 对于通过设置面板主动修改 limit 的场景，仍然沿用「关闭面板时统一写回」的逻辑。
        hasPendingChanges = true;
    });
    sizeRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (!radio.checked) return;
            // 给 S / M / L 映射一个具体像素值
            const sizeLabel = radio.dataset.size;
            const sizeGroup = panel.querySelector<HTMLDivElement>(".plugin-image-setting-size-group");
            if (sizeGroup && sizeLabel) {
                sizeGroup.dataset.size = sizeLabel;
            }
            switch (sizeLabel) {
                case "small":
                    option.size = config.SMALL_SIZE;
                    option.gap = config.SMALL_GAP;
                    option.radius = config.SMALL_RADIUS;
                    break;
                case "medium":
                    option.size = config.MEDIUM_SIZE;
                    option.gap = config.MEDIUM_GAP;
                    option.radius = config.MEDIUM_RADIUS;
                    break;
                case "large":
                    option.size = config.LARGE_SIZE;
                    option.gap = config.LARGE_GAP;
                    option.radius = config.LARGE_RADIUS;
                    break;
            }
            applySettingsToContainer(container, option);
            hasPendingChanges = true;
        });
    });

    return { panel, persistIfNeeded, limitCheckbox };
}

/**
 * 获取当前缩略图对应的外层 wrapper（如果存在且为本插件创建的 wrapper）。
 */
function getImageWrapper(img: HTMLImageElement): HTMLElement | null {
    const parent = img.parentElement;
    if (!(parent instanceof HTMLElement)) return null;
    return parent.classList.contains("plugin-image-wrapper") ? parent : null;
}

/**
 * 同步尺寸 & 圆角到图片及其外层 wrapper。
 */
function applySizeAndRadius(
    img: HTMLImageElement,
    wrapper: HTMLElement | null,
    option: SettingOptions,
): void {
    img.style.setProperty("--plugin-image-size", `${option.size}px`);
    img.style.setProperty("--plugin-image-radius", `${option.radius}px`);
    if (wrapper) {
        wrapper.style.setProperty("--plugin-image-size", `${option.size}px`);
        wrapper.style.setProperty("--plugin-image-radius", `${option.radius}px`);
    }
}

/**
 * 将某个视觉样式类（阴影/边框/隐藏）优先作用到 wrapper，
 * 若不存在 wrapper，则退回到直接作用在图片上。
 */
function applyWrapperPreferredClass(
    img: HTMLImageElement,
    wrapper: HTMLElement | null,
    className: string,
    enabled: boolean,
): void {
    const target = wrapper ?? img;
    if (enabled) {
        target.classList.add(className);
        // 保证 class 只挂在一个元素上，避免样式叠加
        if (wrapper && target === wrapper) {
            img.classList.remove(className);
        } else if (wrapper && target === img) {
            wrapper.classList.remove(className);
        }
    } else {
        target.classList.remove(className);
        wrapper?.classList.remove(className);
        img.classList.remove(className);
    }
}

/**
 * 将 SettingOptions 应用到某个容器中的所有图片与容器本身。
 * 这样 parseStyleOptions + 设置面板 就形成了统一的数据源。
 * 
 * @param container - 图片容器
 * @param option - 配置对象
 * @param onLimitTogglePersist - 当 limit 状态被代码触发变更时（例如点击「+N」蒙版取消限制）
 *                               需要立刻持久化配置行时调用的回调（可选）
 */
function applySettingsToContainer(container: HTMLDivElement, option: SettingOptions, onLimitTogglePersist?: () => void) {
    container.style.setProperty("--plugin-container-gap", `${option.gap}px`);

    // 这里只处理图片组中的缩略图，不包含大图预览；大图预览始终保持原图样式
    const imgs = Array.from(container.querySelectorAll<HTMLImageElement>(".plugin-image"));
    imgs.forEach((img) => {
        const wrapper = getImageWrapper(img);

        // 尺寸 & 圆角（同时作用于图片与外层 wrapper，保证布局和裁剪一致）
        applySizeAndRadius(img, wrapper, option);

        // 阴影 / 边框 / 隐藏：统一用「优先 wrapper」的策略，封装成小工具函数
        applyWrapperPreferredClass(img, wrapper, "plugin-image-shadow", option.shadow);
        applyWrapperPreferredClass(img, wrapper, "plugin-image-border", option.border);
        applyWrapperPreferredClass(img, wrapper, "plugin-image-hidden", option.hidden);
    });

    // 根据 limit 选项，决定是否只显示前三行图片
    applyLimitRows(container, option, onLimitTogglePersist);
}

/**
 * 根据当前容器的宽度 / 图片宽度 / gap，仅保留前三行图片。
 * 当 option.limit 为 false 时，恢复所有被隐藏的元素。
 *
 * 由于初次渲染时 container 还未插入文档，这里用 requestAnimationFrame
 * 等待浏览器完成布局后，再根据「容器宽度 / (图片宽度 + gap)」计算每行可容纳数量。
 *
 * 限制开启时：
 * - 最多显示 3 行
 * - 若还有剩余图片，则最后一张显示为「+N」的灰色蒙版，点击后等同于关闭 limit。
 */
function applyLimitRows(container: HTMLDivElement, option: SettingOptions, onLimitTogglePersist?: () => void): void {
    if (!option.limit) {
        // 关闭限制：立刻恢复所有元素显示
        const allItems = Array.from(
            container.querySelectorAll<HTMLElement>(".plugin-image-wrapper, .plugin-image-error"),
        );
        allItems.forEach((el) => {
            el.style.removeProperty("display");
            const mask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
            if (mask) mask.remove();
            el.classList.remove("plugin-image-more-wrapper");
        });
        return;
    }

    // 开启限制：等待一帧，让浏览器先完成布局，再根据 offsetTop 实际分行。
    // 如果此时容器宽度为 0（例如笔记面板还在布局中），使用 LIMIT_DELAY / LIMIT_MAX_RETRY 做有限次重试，
    // 避免「首次打开页面时不生效，只有手动再勾一次 limit 才生效」的问题。
    let retryCount = 0;

    const runLimit = () => {
        const items = Array.from(
            container.querySelectorAll<HTMLElement>(".plugin-image-wrapper, .plugin-image-error"),
        );
        if (items.length === 0) return;

        // 如果容器还没有正确布局（宽度为 0），稍后重试一次
        if (container.offsetWidth === 0 && retryCount < config.LIMIT_MAX_RETRY) {
            retryCount++;
            setTimeout(runLimit, config.LIMIT_DELAY);
            return;
        }

        /**
         * 使用 offsetTop 实际分行：
         * - 遍历所有元素，按 offsetTop 变化分成多行
         * - 前 MAX_VISIBLE_ROWS 行保留，其余行隐藏
         * - 最后一格替换为 "+N" 蒙版
         */
        const rows: HTMLElement[][] = [];
        let currentTop: number | null = null;

        for (const el of items) {
            const top = el.offsetTop;
            if (currentTop === null || Math.abs(top - currentTop) > 1) {
                currentTop = top;
                rows.push([]);
            }
            rows[rows.length - 1].push(el);
        }

        const maxRows = config.MAX_VISIBLE_ROWS;

        // 不足 maxRows 行：全部显示，不加蒙版
        if (rows.length <= maxRows) {
            items.forEach((el) => {
                // 恢复正常显示状态：移除「隐藏行」和蒙版相关的样式
                el.classList.remove("plugin-image-row-hidden");
                const oldMask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
                if (oldMask) oldMask.remove();
                el.classList.remove("plugin-image-more-wrapper");
            });
            return;
        }

        // 预清理：移除之前的蒙版
        items.forEach((el) => {
            const oldMask = el.querySelector<HTMLDivElement>(".plugin-image-more-mask");
            if (oldMask) oldMask.remove();
            el.classList.remove("plugin-image-more-wrapper");
            el.classList.remove("plugin-image-row-hidden");
        });

        // 前 maxRows 行中的最后一个元素作为 "+N" 容器
        const visibleRows = rows.slice(0, maxRows);
        const flattenedVisible = visibleRows.flat();
        const overlayEl = flattenedVisible[flattenedVisible.length - 1];

        // 0 ~ (flattenedVisible.length - 2) 是真实显示的原图
        const visibleOriginalSet = new Set(flattenedVisible.slice(0, -1));

        const totalCount = items.length;
        const visibleOriginalCount = visibleOriginalSet.size;
        const remainingCount = totalCount - visibleOriginalCount;

        items.forEach((el) => {
            if (visibleOriginalSet.has(el)) {
                // 在前三行内、且不是最后一个格子的原图
                el.classList.remove("plugin-image-row-hidden");
            } else if (el === overlayEl) {
                // 带 "+N" 的蒙版图片
                el.classList.remove("plugin-image-row-hidden");
                el.classList.add("plugin-image-more-wrapper");

                const mask = document.createElement("div");
                mask.className = "plugin-image-more-mask";
                const text = document.createElement("span");
                text.className = "plugin-image-more-text";
                text.textContent = `+ ${remainingCount}`;
                mask.appendChild(text);

                // 点击蒙版：关闭 limit，同步 UI 复选框，并持久化。
                // 注意：setting panel 挂在 document.body 而非 container 内，
                // 因此通过 WeakMap 直接拿到 limitCheckbox 引用来同步状态，
                // 而不是用 container.querySelector（那样永远找不到）。
                mask.addEventListener("click", (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    option.limit = false;
                    // 同步设置面板中的复选框 UI
                    const limitCheckbox = containerLimitCheckboxMap.get(container);
                    if (limitCheckbox) limitCheckbox.checked = false;
                    // 重新应用配置，移除蒙版、显示所有图片
                    applySettingsToContainer(container, option);
                    if (onLimitTogglePersist) onLimitTogglePersist();
                });

                el.appendChild(mask);
            } else {
                // 超出前三行 + 1 个蒙版的全部隐藏：通过 CSS class 控制 display
                el.classList.add("plugin-image-row-hidden");
            }
        });
    };

    // 首次调用仍然放在 requestAnimationFrame 中，避免同步强制布局
    requestAnimationFrame(runLimit);
}

/**
 * 将当前 option 写回到对应 Markdown 文档的代码块中（更新/插入配置行）。
 *
 * 约定格式：
 *   size=220&gap=10&radius=10&shadow=false&border=false;;
 *   ![img](...)
 *
 * 注意：
 * - 之前用 editor.replaceRange 在某些情况下（多窗口 / 预览模式等）会出现「逻辑上写入成功但在 Obsidian 里看不到」的问题。
 * - 这里改为直接基于 Vault 文件内容进行修改，再整体写回，保证预览和编辑视图都能正确刷新。
 * 
 * @param option - 配置对象
 * @param plugin - 插件实例
 * @param ctx - 上下文
 * @param el - 元素
 * @returns 持久化函数
 */
async function persistOptionsToSource(option: SettingOptions, plugin: ImgRowPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement): Promise<void> {
    const section = ctx.getSectionInfo(el);
    if (!section) return;

    // 通过 ctx.sourcePath 拿到真正的文件，而不是依赖当前激活视图
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    // 读取整篇文档文本
    const content = await plugin.app.vault.read(file);
    const lines = content.split("\n");

    // 代码块内部内容所在的行范围：
    // section.lineStart    -> ```imgs 这一行
    // section.lineStart+1  -> 代码块内部第一行
    // section.lineEnd      -> ``` 这一行
    const innerStart = section.lineStart + 1;
    const innerEnd = section.lineEnd;

    if (innerStart >= innerEnd || innerStart < 0 || innerEnd > lines.length) return;

    const currentInner = lines.slice(innerStart, innerEnd).join("\n");
    const newInner = buildInnerSourceFromOptions(option, currentInner);
    if (newInner === currentInner) return;

    // buildInnerSourceFromOptions 可能会在末尾带一个换行，这里统一拆成行数组
    const newInnerLines = newInner.endsWith("\n")
        ? newInner.slice(0, -1).split("\n")
        : newInner.split("\n");

    const newLines = [
        ...lines.slice(0, innerStart),
        ...newInnerLines,
        ...lines.slice(innerEnd),
    ];

    await plugin.app.vault.modify(file, newLines.join("\n"));
}

/**
 * 根据当前配置构造（或更新）代码块内部的文本内容。
 * 会保留原有的图片 Markdown，只替换/添加配置行。
 * 
 * @param option - 配置对象
 * @param currentInner - 代码块内部内容
 * @returns 构造后的代码块内部内容
 */
function buildInnerSourceFromOptions(option: SettingOptions, currentInner: string): string {
    const styleLine = option.buildStyleLineConfig();
    const endSign = ";;";

    // 原来没有任何配置，直接在最前面插入一行配置
    if (!currentInner.includes(endSign)) {
        const trimmed = currentInner.replace(/^\s*/, "");
        return `${styleLine}${endSign}\n${trimmed}`;
    }

    // 原来有配置，则删掉原有配置，写入新的配置
    const idx = currentInner.indexOf(endSign);
    if (idx === -1) {
        // 理论上不会走到这里，兜底按「无配置」处理
        const trimmed = currentInner.replace(/^\s*/, "");
        return `${styleLine}${endSign}\n${trimmed}`;
    }

    // 去掉旧配置与分隔符，仅保留之后的图片等内容
    const after = currentInner.slice(idx + endSign.length);
    const imagesPart = after.replace(/^[ \t\r\n]*/, "");
    return `${styleLine}${endSign}\n${imagesPart}`;
}

/**
 * 编辑模式下为图片容器添加拖拽排序功能。
 * 拖拽完成后自动将新顺序写回对应 Markdown 文件。
 */
function enableDragSort(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): void {
    let dragSrcEl: HTMLElement | null = null;

    const getWrappers = () =>
        Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"));

    const clearIndicators = () =>
        getWrappers().forEach(w => w.classList.remove("plugin-image-drag-before", "plugin-image-drag-after"));

    getWrappers().forEach(wrapper => {
        wrapper.draggable = true;
        wrapper.classList.add("plugin-image-sortable");

        wrapper.addEventListener("dragstart", e => {
            dragSrcEl = wrapper;
            wrapper.classList.add("plugin-image-dragging");
            e.dataTransfer?.setData("text/plain", "");
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        });

        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("plugin-image-dragging");
            clearIndicators();
            dragSrcEl = null;
        });

        wrapper.addEventListener("dragover", e => {
            e.preventDefault();
            if (!dragSrcEl || dragSrcEl === wrapper) return;
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            clearIndicators();
            const rect = wrapper.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                wrapper.classList.add("plugin-image-drag-before");
            } else {
                wrapper.classList.add("plugin-image-drag-after");
            }
        });

        wrapper.addEventListener("dragleave", () => {
            wrapper.classList.remove("plugin-image-drag-before", "plugin-image-drag-after");
        });

        wrapper.addEventListener("drop", e => {
            e.preventDefault();
            if (!dragSrcEl || dragSrcEl === wrapper) return;
            const rect = wrapper.getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) {
                container.insertBefore(dragSrcEl, wrapper);
            } else {
                container.insertBefore(dragSrcEl, wrapper.nextSibling);
            }
            clearIndicators();
            void persistReorderToSource(container, plugin, ctx, el);
        });
    });
}

/**
 * 将当前 DOM 中 wrapper 的排列顺序写回对应 Markdown 文件的代码块。
 */
async function persistReorderToSource(
    container: HTMLDivElement,
    plugin: ImgRowPlugin,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
): Promise<void> {
    const section = ctx.getSectionInfo(el);
    if (!section) return;

    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const content = await plugin.app.vault.read(file);
    const lines = content.split("\n");

    const innerStart = section.lineStart + 1;
    const innerEnd = section.lineEnd;
    if (innerStart >= innerEnd || innerStart < 0 || innerEnd > lines.length) return;

    const innerLines = lines.slice(innerStart, innerEnd);

    // 保留配置行（含 ;; 的行）
    const configLine = innerLines.find(l => l.includes(";;")) ?? null;

    // 按 DOM 当前顺序读取各 wrapper 存储的原始 markdown 图片行
    const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"));
    const newImageLines = wrappers.map(w => w.dataset.imgLine).filter(Boolean) as string[];
    if (newImageLines.length === 0) return;

    const newInner = configLine
        ? `${configLine}\n${newImageLines.join("\n")}`
        : newImageLines.join("\n");

    const newLines = [
        ...lines.slice(0, innerStart),
        ...newInner.split("\n"),
        ...lines.slice(innerEnd),
    ];

    await plugin.app.vault.modify(file, newLines.join("\n"));
}

