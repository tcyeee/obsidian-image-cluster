import { PreviewItem } from "../core/domain";
import { setCssProps } from "../core/dom";
import { config } from "../core/config";

/**
 * 打开大图/视频预览 overlay。
 * 图片支持：滚轮/双指捏合缩放、拖拽平移、左右切换（按钮/方向键）、长截图滚动模式。
 * 视频：使用原生 <video controls> 播放，不支持缩放/平移——播放进度条/音量本身就需要
 * 鼠标拖拽，与图片的手势缩放/平移语义冲突，因此视频参与的切换（无论切入还是切出）
 * 均不做滑动动画，直接换帧展示。
 *
 * @param item - 当前项（srcList 不可用时的兜底）
 * @param srcList - 图片组中全部原图/原视频地址（用于左右切换）
 * @param idx - 当前项在 srcList 中的索引
 */
export function openImagePreview(item: PreviewItem, srcList?: PreviewItem[], idx?: number): void {
    let curIdx = idx || 0;
    const getItem = (i: number): PreviewItem => srcList?.[i] ?? item;

    const overlay = createDiv({ cls: "plugin-image-overlay" });

    const largeImg = createEl("img");
    largeImg.classList.add("plugin-image-large");

    const largeVideo = createEl("video");
    largeVideo.classList.add("plugin-image-large", "plugin-image-large--video");
    largeVideo.controls = true;
    largeVideo.autoplay = true;
    largeVideo.playsInline = true;

    // 长截图自适应：高宽比 > 2 时切换为可滚动模式，以宽度为基准展示（仅图片）
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

    const prevBtn = createEl("button");
    prevBtn.textContent = "←";
    prevBtn.className = "plugin-image-nav-btn plugin-image-nav-btn-prev";
    const nextBtn = createEl("button");
    nextBtn.textContent = "→";
    nextBtn.className = "plugin-image-nav-btn plugin-image-nav-btn-next";

    let scale = 1;
    let tx = 0; // 拖拽平移 X
    let ty = 0; // 拖拽平移 Y

    // 平移/缩放统一通过 CSS 变量注入，transform 本身定义在 .plugin-image-large 中
    const setPreviewPos = (x: number, y: number, s: number) => {
        setCssProps(largeImg, {
            "--plugin-preview-tx": `${x}px`,
            "--plugin-preview-ty": `${y}px`,
            "--plugin-preview-scale": `${s}`,
        });
    };
    const applyTransform = () => setPreviewPos(tx, ty, scale);

    // 展示指定项：按类型切换 largeImg / largeVideo 的显隐，并重置缩放/平移状态。
    // largeImg 与 largeVideo 全程都挂在 overlay 中（只是互相隐藏），而不是按需创建/销毁——
    // 这样绑在 largeImg 上的缩放/平移手势监听器始终对着同一个元素，不需要在切换时重新绑定。
    const showItem = (it: PreviewItem) => {
        scale = 1; tx = 0; ty = 0;
        overlay.classList.remove("plugin-image-overlay--scrollable");
        largeImg.classList.remove("plugin-image-large--tall");
        if (it.isVideo) {
            largeImg.classList.add("plugin-image-large--hidden");
            largeVideo.classList.remove("plugin-image-large--hidden");
            largeVideo.src = it.src;
        } else {
            // 切走时停止视频播放/释放资源，避免切到图片后视频仍在背后继续播放
            largeVideo.pause();
            largeVideo.removeAttribute("src");
            largeVideo.load();
            largeVideo.classList.add("plugin-image-large--hidden");
            largeImg.classList.remove("plugin-image-large--hidden");
            setPreviewPos(0, 0, 1);
            largeImg.src = it.src;
        }
    };

    const initialItem = getItem(curIdx);
    showItem(initialItem);
    if (!initialItem.isVideo && largeImg.complete && largeImg.naturalWidth > 0) applyTallMode();

    // 滚轮缩放（passive: false 使 preventDefault 生效，阻止 overlay 滚动）——仅图片
    largeImg.addEventListener("wheel", e => {
        e.preventDefault();
        e.stopPropagation();
        const oldScale = scale;
        if (e.deltaY < 0) {
            scale = Math.round(Math.min(config.PREVIEW_MAX_SCALE, scale + 0.1) * 100) / 100;
        } else {
            scale = Math.round(Math.max(config.PREVIEW_MIN_SCALE, scale - 0.1) * 100) / 100;
        }
        // 以鼠标位置为缩放中心，调整平移量使光标下的内容不跑偏
        const factor = scale / oldScale;
        const rect = largeImg.getBoundingClientRect();
        tx += (e.clientX - (rect.left + rect.width / 2)) * (1 - factor);
        ty += (e.clientY - (rect.top + rect.height / 2)) * (1 - factor);
        applyTransform();
    }, { passive: false });

    // 拖拽平移（鼠标，桌面端）——仅图片
    let isDragging = false;
    let wasDragged = false; // 用于区分拖拽和点击，避免拖拽结束时误关闭预览
    let dragStartX = 0;
    let dragStartY = 0;

    largeImg.addEventListener("mousedown", e => {
        isDragging = true;
        wasDragged = false;
        dragStartX = e.clientX - tx;
        dragStartY = e.clientY - ty;
        // 拖拽期间禁用 CSS transition，防止每帧 transform 更新都触发动画，
        // 导致动画从中间位置跳变（在边缘处表现为闪烁）
        largeImg.classList.add("plugin-image-large--dragging");
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
            // 恢复 CSS 默认 transition 和 cursor（移除拖拽态 class 即可）
            largeImg.classList.remove("plugin-image-large--dragging");
        }
    });

    overlay.addEventListener("mouseleave", () => {
        if (isDragging) {
            isDragging = false;
            largeImg.classList.remove("plugin-image-large--dragging");
        }
    });

    // ---- 触摸事件（移动端） ----
    // 单指拖拽平移 + 双指捏合缩放（仅图片）
    let lastPinchDist = 0;
    // 追踪捏合手势是否正在进行：捏合期间及最后一根手指抬起时均需屏蔽关闭预览
    let isPinching = false;

    // 任意位置的 touchstart：有 2 根以上手指时，标记为捏合中
    overlay.addEventListener("touchstart", e => {
        if (e.touches.length >= 2) isPinching = true;
    }, { passive: true });

    largeImg.addEventListener("touchstart", e => {
        if (e.touches.length !== 1) return;
        isDragging = true;
        wasDragged = false;
        dragStartX = e.touches[0].clientX - tx;
        dragStartY = e.touches[0].clientY - ty;
        largeImg.classList.add("plugin-image-large--dragging"); // 拖拽期间禁用 transition，防止闪烁
        e.preventDefault(); // 阻止滚动
    }, { passive: false });

    overlay.addEventListener("touchmove", e => {
        e.preventDefault(); // 阻止 overlay 自身滚动
        if (e.touches.length === 2) {
            // 双指捏合缩放（手指可以在 overlay 任意位置）
            isPinching = true;
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            if (lastPinchDist > 0) {
                const oldScale = scale;
                scale = Math.min(config.PREVIEW_MAX_SCALE, Math.max(config.PREVIEW_MIN_SCALE, scale * (dist / lastPinchDist)));
                // 以两指中点为缩放中心，调整平移量
                const factor = scale / oldScale;
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = largeImg.getBoundingClientRect();
                tx += (midX - (rect.left + rect.width / 2)) * (1 - factor);
                ty += (midY - (rect.top + rect.height / 2)) * (1 - factor);
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

        // 捏合手势结束：等所有手指都抬起后才重置标志，
        // 期间（含最后一根手指抬起的这一帧）一律不执行关闭，避免缩放与关闭冲突。
        if (isPinching) {
            if (e.touches.length === 0) isPinching = false;
            return;
        }

        if (isDragging) {
            isDragging = false;
            largeImg.classList.remove("plugin-image-large--dragging"); // 恢复 CSS 默认 transition
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

    // 切换图片/视频函数（图片之间带方向滑动动画；只要一端涉及视频，直接换帧，不做动画）
    const ANIM_MS = 220;
    let isAnimating = false;

    const switchTo = (newIdx: number, direction: "next" | "prev") => {
        if (!srcList || isAnimating) return;

        const curItem = getItem(curIdx);
        const nextItem = srcList[newIdx];

        if (curItem.isVideo || nextItem.isVideo) {
            curIdx = newIdx;
            showItem(nextItem);
            overlay.scrollTop = 0;
            updateBtnState();
            return;
        }

        isAnimating = true;

        const exitX = direction === "next" ? -140 : 140;  // 当前图片滑出方向
        const enterX = direction === "next" ? 140 : -140; // 新图片进入起始位置

        // 阶段一：当前图片滑出 + 淡出
        largeImg.classList.add("plugin-image-large--switching");
        setPreviewPos(exitX, 0, scale);
        largeImg.classList.add("plugin-image-large--faded");

        window.setTimeout(() => {
            // 阶段二：切换图源，瞬间移到入场起始位置（不触发 transition）
            curIdx = newIdx;
            largeImg.src = nextItem.src;
            scale = 1; tx = 0; ty = 0;
            overlay.scrollTop = 0;

            largeImg.classList.remove("plugin-image-large--switching");
            largeImg.classList.add("plugin-image-large--no-anim");
            setPreviewPos(enterX, 0, 1);

            // 阶段三：滑入 + 淡入（两次 rAF 确保浏览器先处理 transition:none）
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    largeImg.classList.remove("plugin-image-large--no-anim");
                    largeImg.classList.add("plugin-image-large--switching");
                    setPreviewPos(0, 0, 1);
                    largeImg.classList.remove("plugin-image-large--faded");

                    window.setTimeout(() => {
                        largeImg.classList.remove("plugin-image-large--switching"); // 还原 CSS 默认 transition
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
    overlay.appendChild(largeVideo);
    activeDocument.body.appendChild(overlay);

    window.requestAnimationFrame(() => {
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
    activeDocument.addEventListener("keydown", handleKeydown);
    function closePreview() {
        largeVideo.pause();
        overlay.classList.remove("plugin-image-overlay-visible");
        window.setTimeout(() => { overlay.remove() }, 300);
        activeDocument.removeEventListener("keydown", handleKeydown);
    }
}
