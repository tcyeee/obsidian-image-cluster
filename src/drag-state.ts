import { MarkdownPostProcessorContext } from "obsidian";

/**
 * 自定义 dataTransfer 类型：用来标记「这是本插件发起的、把一张独立图片拖入图片组」的拖拽，
 * 与 Obsidian 原生的文件拖拽嵌入（从 Finder/资源管理器拖图片进编辑器）区分开，
 * 避免目标容器的 drop 逻辑误吞后者。
 */
export const STANDALONE_IMAGE_DRAG_MIME = "application/x-imgcluster-image";

export interface StandaloneDragPayload {
    /** 源图片所在文件路径；落盘时必须与目标图片组所在文件一致，防止跨文件误删行 */
    sourcePath: string;
    /** 该图片在文件中所在行的行号（0 基），用于落盘时删除原始行 */
    lineIndex: number;
    /** 该行原始 Markdown 文本（如 "![[a.png]]"），落盘时作为新的一行插入目标代码块 */
    markdown: string;
}

let currentDrag: StandaloneDragPayload | null = null;

export function setCurrentDrag(payload: StandaloneDragPayload): void {
    currentDrag = payload;
}

export function getCurrentDrag(): StandaloneDragPayload | null {
    return currentDrag;
}

export function clearCurrentDrag(): void {
    currentDrag = null;
}

/**
 * 自定义 dataTransfer 类型：用来标记「这是本插件发起的、把图片组内某张图片拖出」的拖拽，
 * 与 STANDALONE_IMAGE_DRAG_MIME（拖入图片组）互不相同——这样拖出操作落在另一个已有
 * 图片组上时不会被其"拖入"逻辑误识别（组间直接移动不在支持范围内，会被自然忽略）。
 */
export const GROUP_IMAGE_DRAG_MIME = "application/x-imgcluster-group-image";

export interface GroupDragPayload {
    /** 源图片组所在文件路径；落点必须与之一致，防止跨文件误删/误插 */
    sourcePath: string;
    /** 被拖出图片的原始 Markdown 行 */
    markdown: string;
    /** 被拖出图片所属的图片组容器 */
    container: HTMLDivElement;
    /** 图片组所在代码块的 MarkdownPostProcessorContext，用于定位代码块在文件中的行范围 */
    ctx: MarkdownPostProcessorContext;
    /** 图片组代码块渲染出的根元素，配合 ctx.getSectionInfo 使用 */
    el: HTMLElement;
    /** 被拖出的 wrapper 本身，用于从"剩余图片"列表中排除它 */
    wrapper: HTMLElement;
    /**
     * 拖拽开始时，图片组内全部图片行的快照（DOM 顺序）。
     * el/container/wrapper 都可能在拖拽过程中因为代码块被重渲染（例如同一文件其他地方的编辑
     * 触发了整篇重新解析）而失效；此时落盘逻辑改为基于这份快照在当前文件里重新定位代码块、
     * 计算剩余图片，不再依赖可能已经过期的 DOM 引用。
     */
    imageLinesSnapshot: string[];
    /**
     * 被拖出图片在 imageLinesSnapshot 中的下标。用下标而不是按 markdown 文本过滤剩余图片，
     * 是因为同一图片组内可能出现完全相同的图片行（同一张图重复引用），按内容过滤会把两个都删掉。
     */
    draggedIndex: number;
}

let currentGroupDrag: GroupDragPayload | null = null;

export function setGroupDrag(payload: GroupDragPayload): void {
    currentGroupDrag = payload;
}

export function getGroupDrag(): GroupDragPayload | null {
    return currentGroupDrag;
}

export function clearGroupDrag(): void {
    currentGroupDrag = null;
}
