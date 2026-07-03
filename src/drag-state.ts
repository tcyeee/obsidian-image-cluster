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
