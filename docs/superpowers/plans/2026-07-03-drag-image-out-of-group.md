# 从图片组中拖出图片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Live Preview 编辑模式下，允许把图片组内的一张图片拖出，松手释放到编辑器中任意普通文本行时，该图片从原图片组中移除并变成一行独立的 Markdown 图片。

**Architecture:** 镜像现有「独立图片拖入图片组」的实现（`image-drag-source.ts` + `render/drag-sort.ts` + `drag-state.ts`）：用一个独立的 `GROUP_IMAGE_DRAG_MIME` 标记「这是从图片组拖出的图片」，wrapper 的 `dragstart` 记录来源信息到模块级状态，文档级 `dragover`/`drop` 负责在编辑器空白行前后插入并触发一次合并读改写（原代码块删除该图片 + 目标位置插入该行）。

**Tech Stack:** TypeScript, Obsidian Plugin API, CodeMirror 6 (`@codemirror/view`), esbuild, pnpm。

## Global Constraints

- 本仓库没有单元测试框架；每个代码任务的「测试」步骤统一用 `pnpm build`（`tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`）做类型检查/编译验证，命令必须以退出码 0 结束且不打印 tsc 报错。
- 不支持跨文件拖拽；不支持直接拖入另一个已有图片组（组间移动）；落点若在任何 `.plugin-image-container` 内部（含原图片组自身空白区域）一律视为无效目标、忽略不处理。参见设计文档 `docs/superpowers/specs/2026-07-03-drag-image-out-of-group-design.md`。
- 复用现有 `enableDragToGroup` 设置开关，不新增开关。
- 每个任务完成后必须单独 `git commit`（不要把多个任务合并成一个 commit）。
- 全部代码任务完成后，按用户全局 CLAUDE.md 规则执行一次部署：`pnpm build` 后把 `main.js`、`manifest.json`、`styles.css` 复制到 `/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/image-cluster/`（该插件已在目标 vault 中启用，Obsidian 的 hot-reload 会自动重载，无需提醒用户手动启用）。

---

### Task 1: 扩展 `src/drag-state.ts` 增加"拖出图片组"的拖拽状态

**Files:**
- Modify: `src/drag-state.ts`

**Interfaces:**
- Consumes: 无（新增独立的一路状态，不依赖已有的 `StandaloneDragPayload`/`currentDrag`）
- Produces（后续任务会用到，务必保持签名一致）：
  - `export const GROUP_IMAGE_DRAG_MIME = "application/x-imgcluster-group-image";`
  - `export interface GroupDragPayload { sourcePath: string; markdown: string; container: HTMLDivElement; ctx: MarkdownPostProcessorContext; el: HTMLElement; wrapper: HTMLElement; }`
  - `export function setGroupDrag(payload: GroupDragPayload): void`
  - `export function getGroupDrag(): GroupDragPayload | null`
  - `export function clearGroupDrag(): void`

- [ ] **Step 1: 在文件顶部增加 `MarkdownPostProcessorContext` 类型导入**

把文件第一行改为：

```ts
import { MarkdownPostProcessorContext } from "obsidian";

/**
 * 自定义 dataTransfer 类型：用来标记「这是本插件发起的、把一张独立图片拖入图片组」的拖拽，
 * 与 Obsidian 原生的文件拖拽嵌入（从 Finder/资源管理器拖图片进编辑器）区分开，
 * 避免目标容器的 drop 逻辑误吞后者。
 */
export const STANDALONE_IMAGE_DRAG_MIME = "application/x-imgcluster-image";
```

（其余已有内容保持不变。）

- [ ] **Step 2: 在文件末尾追加"拖出图片组"的状态与 MIME 常量**

在文件末尾（`clearCurrentDrag` 函数之后）追加：

```ts

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
```

- [ ] **Step 3: 类型检查**

Run: `pnpm build`
Expected: 命令退出码为 0，无 tsc 报错（esbuild 会打印类似 `[watch] build finished` 或 bundle 大小的成功信息）。

- [ ] **Step 4: Commit**

```bash
git add src/drag-state.ts
git commit -m "feat: add drag state for dragging an image out of an image group"
```

---

### Task 2: `render/drag-sort.ts` 在 wrapper 拖拽开始/结束时记录拖出状态

**Files:**
- Modify: `src/render/drag-sort.ts:1-5`（imports）
- Modify: `src/render/drag-sort.ts:103-114`（wrapper 的 `dragstart`/`dragend` 监听）

**Interfaces:**
- Consumes: Task 1 的 `GROUP_IMAGE_DRAG_MIME`, `GroupDragPayload`, `setGroupDrag`, `clearGroupDrag`（均来自 `../drag-state`）
- Produces: 无新增导出；`enableDragSort` 的行为在原有基础上追加"记录拖出来源"，函数签名不变

- [ ] **Step 1: 扩展 import**

把文件顶部的：

```ts
import { STANDALONE_IMAGE_DRAG_MIME, getCurrentDrag } from "../drag-state";
```

改为：

```ts
import { STANDALONE_IMAGE_DRAG_MIME, getCurrentDrag, GROUP_IMAGE_DRAG_MIME, setGroupDrag, clearGroupDrag } from "../drag-state";
```

- [ ] **Step 2: wrapper `dragstart` 时同时记录"拖出图片组"状态**

把现有的：

```ts
        wrapper.addEventListener("dragstart", e => {
            dragSrcEl = wrapper;
            wrapper.classList.add("plugin-image-dragging");
            e.dataTransfer?.setData("text/plain", "");
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        });
```

改为：

```ts
        wrapper.addEventListener("dragstart", e => {
            dragSrcEl = wrapper;
            wrapper.classList.add("plugin-image-dragging");
            e.dataTransfer?.setData("text/plain", "");
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";

            // 同时记录"拖出图片组"所需的状态，供 editor-drop-target.ts 在松手落到编辑器
            // 空白处时使用；组内重排（拖回本组）不受影响，因为那条路径只依赖上面的 dragSrcEl。
            if (plugin.settings.enableDragToGroup) {
                setGroupDrag({
                    sourcePath: ctx.sourcePath,
                    markdown: wrapper.dataset.imgLine ?? "",
                    container,
                    ctx,
                    el,
                    wrapper,
                });
                e.dataTransfer?.setData(GROUP_IMAGE_DRAG_MIME, "1");
            }
        });
```

- [ ] **Step 3: wrapper `dragend` 时清理拖出状态**

把现有的：

```ts
        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("plugin-image-dragging");
            clearIndicators();
            dragSrcEl = null;
        });
```

改为：

```ts
        wrapper.addEventListener("dragend", () => {
            wrapper.classList.remove("plugin-image-dragging");
            clearIndicators();
            dragSrcEl = null;
            clearGroupDrag();
        });
```

- [ ] **Step 4: 类型检查**

Run: `pnpm build`
Expected: 退出码 0，无 tsc 报错。

- [ ] **Step 5: Commit**

```bash
git add src/render/drag-sort.ts
git commit -m "feat: record group-drag state when dragging a wrapper inside an image group"
```

---

### Task 3: `src/markdown/persistence.ts` 新增 `persistDragOutToSource`

**Files:**
- Modify: `src/markdown/persistence.ts`

**Interfaces:**
- Consumes: `GroupDragPayload` 类型（来自 Task 1 的 `../drag-state`）；`ImgRowPlugin`（来自 `main`，文件已有此导入）
- Produces（Task 4 会用到，务必保持签名一致）：
  - `export async function persistDragOutToSource(groupDrag: GroupDragPayload, plugin: ImgRowPlugin, targetLineIndex: number, insertBefore: boolean): Promise<void>`

- [ ] **Step 1: 增加类型导入**

把文件顶部的：

```ts
import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { SettingOptions } from "../core/domain";
```

改为：

```ts
import ImgRowPlugin from "main";
import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { SettingOptions } from "../core/domain";
import { GroupDragPayload } from "../drag-state";
```

- [ ] **Step 2: 在文件末尾追加 `persistDragOutToSource`**

在文件末尾（`persistDragInsertToSource` 函数之后）追加：

```ts

/**
 * 把图片组内的一张图片拖出，变成编辑器中一行独立的 Markdown 图片：一次读改写同时完成
 * 「从原图片组代码块中移除该图片」与「在目标位置插入这一行」，避免分两次写入文件产生行号错位。
 *
 * @param groupDrag - 被拖出图片的来源信息（图片组容器、代码块 ctx/el、原始 Markdown 行等）
 * @param plugin - 插件实例
 * @param targetLineIndex - 目标插入位置的行号（0 基，落盘前、修改前的文件行号）
 * @param insertBefore - true 表示插入到目标行之前，false 表示插入到目标行之后
 */
export async function persistDragOutToSource(
    groupDrag: GroupDragPayload,
    plugin: ImgRowPlugin,
    targetLineIndex: number,
    insertBefore: boolean,
): Promise<void> {
    const file = plugin.app.vault.getAbstractFileByPath(groupDrag.sourcePath);
    if (!(file instanceof TFile)) return;

    const content = await plugin.app.vault.read(file);
    const lines = content.split("\n");

    const section = groupDrag.ctx.getSectionInfo(groupDrag.el);
    if (!section) return;

    const fenceStart = section.lineStart; // ```imgs 这一行
    const fenceEnd = section.lineEnd;     // ``` 这一行
    if (fenceStart < 0 || fenceEnd >= lines.length || fenceStart > fenceEnd) return;

    // 目标位置必须落在原代码块范围之外，否则视为无效目标（理论上不会发生：
    // editor-drop-target.ts 已经在 DOM 层面排除了落在图片组容器内部的情况，这里是防御）
    if (targetLineIndex >= fenceStart && targetLineIndex <= fenceEnd) return;

    const innerStart = fenceStart + 1;
    const innerEnd = fenceEnd;
    const innerLines = lines.slice(innerStart, innerEnd);
    const configLine = innerLines.find(l => l.includes(";;")) ?? null;

    // 按 DOM 当前顺序读取剩余图片（排除被拖出的那一个）
    const remainingWrappers = Array.from(groupDrag.container.querySelectorAll<HTMLElement>(".plugin-image-wrapper"))
        .filter(w => w !== groupDrag.wrapper);
    const remainingImageLines = remainingWrappers.map(w => w.dataset.imgLine).filter(Boolean) as string[];

    let newBlockLines: string[];
    if (remainingImageLines.length === 0) {
        // 图片组被掏空：整个代码块一并删除
        newBlockLines = [];
    } else if (remainingImageLines.length === 1) {
        // 只剩 1 张：自动拆包为一行普通图片，不再保留代码块
        newBlockLines = [remainingImageLines[0]];
    } else {
        // 仍有 2 张及以上：保留 fence，重建内部内容
        const newInner = configLine ? [configLine, ...remainingImageLines] : remainingImageLines;
        newBlockLines = [lines[fenceStart], ...newInner, lines[fenceEnd]];
    }

    const originalBlockLength = fenceEnd - fenceStart + 1;
    const delta = newBlockLines.length - originalBlockLength;

    const newLines = [...lines];
    newLines.splice(fenceStart, originalBlockLength, ...newBlockLines);

    // 目标行在原代码块之后时，要按整块的行数差做偏移修正；目标行在原代码块之前则不受影响
    const adjustedTargetIndex = targetLineIndex > fenceEnd ? targetLineIndex + delta : targetLineIndex;
    const insertAt = insertBefore ? adjustedTargetIndex : adjustedTargetIndex + 1;
    newLines.splice(insertAt, 0, groupDrag.markdown);

    await plugin.app.vault.modify(file, newLines.join("\n"));
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm build`
Expected: 退出码 0，无 tsc 报错。

- [ ] **Step 4: Commit**

```bash
git add src/markdown/persistence.ts
git commit -m "feat: add persistDragOutToSource to move an image from a group into the document"
```

---

### Task 4: 新建 `src/editor-drop-target.ts`（编辑器空白处的拖放目标）

**Files:**
- Create: `src/editor-drop-target.ts`

**Interfaces:**
- Consumes:
  - `GROUP_IMAGE_DRAG_MIME`, `getGroupDrag`, `clearGroupDrag`（来自 Task 1 的 `./drag-state`）
  - `persistDragOutToSource(groupDrag, plugin, targetLineIndex, insertBefore): Promise<void>`（来自 Task 3 的 `./markdown/persistence`）
- Produces（Task 5 会用到）：
  - `export function registerEditorDropTarget(plugin: ImgRowPlugin): void`
  - CSS class 名称字符串 `plugin-image-dragline-before` / `plugin-image-dragline-after`（Task 6 的 CSS 需要与此完全一致）

- [ ] **Step 1: 创建文件并实现**

```ts
import ImgRowPlugin from "main";
import { EditorView } from "@codemirror/view";
import { GROUP_IMAGE_DRAG_MIME, getGroupDrag, clearGroupDrag } from "./drag-state";
import { persistDragOutToSource } from "./markdown/persistence";

const LINE_BEFORE_CLASS = "plugin-image-dragline-before";
const LINE_AFTER_CLASS = "plugin-image-dragline-after";

/**
 * 找到 clientX/clientY 命中的 CM6 行元素，以及应该插入在其"之前"还是"之后"。
 * 落点必须在某个 Live Preview 编辑器内，且不在任何图片组容器（.plugin-image-container）
 * 内部——落在图片组内部的情况已经由组内拖拽排序 / 拖入逻辑处理，这里不重复处理。
 */
function resolveLineTarget(
    clientX: number,
    clientY: number,
): { lineEl: HTMLElement; lineIndex: number; before: boolean } | null {
    const el = activeDocument.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el || el.closest(".plugin-image-container")) return null;

    const lineElement = el.closest(".cm-line") as HTMLElement | null;
    const editorRoot = el.closest(".cm-editor") as HTMLElement | null;
    if (!lineElement || !editorRoot) return null;

    const view = EditorView.findFromDOM(editorRoot);
    if (!view) return null;

    const pos = view.posAtDOM(lineElement);
    const line = view.state.doc.lineAt(pos);
    const rect = lineElement.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;

    return { lineEl: lineElement, lineIndex: line.number - 1, before };
}

function clearLineIndicators(): void {
    activeDocument.querySelectorAll(`.${LINE_BEFORE_CLASS}, .${LINE_AFTER_CLASS}`).forEach(node => {
        node.classList.remove(LINE_BEFORE_CLASS, LINE_AFTER_CLASS);
    });
}

/**
 * 把图片组内拖出的图片，在松手时插入到编辑器（Live Preview）中普通文本行的前/后，
 * 成为一行独立的 Markdown 图片；同时从原图片组中移除。
 */
export function registerEditorDropTarget(plugin: ImgRowPlugin): void {
    plugin.registerDomEvent(document, "dragover", (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes(GROUP_IMAGE_DRAG_MIME)) return;
        clearLineIndicators();
        const target = resolveLineTarget(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        target.lineEl.classList.add(target.before ? LINE_BEFORE_CLASS : LINE_AFTER_CLASS);
    });

    plugin.registerDomEvent(document, "drop", (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes(GROUP_IMAGE_DRAG_MIME)) return;
        e.preventDefault();
        clearLineIndicators();
        const groupDrag = getGroupDrag();
        const target = resolveLineTarget(e.clientX, e.clientY);
        clearGroupDrag();
        if (!groupDrag || !target) return;
        void persistDragOutToSource(groupDrag, plugin, target.lineIndex, target.before);
    });

    plugin.registerDomEvent(document, "dragend", () => {
        clearLineIndicators();
        clearGroupDrag();
    });
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 退出码 0，无 tsc 报错。

- [ ] **Step 3: Commit**

```bash
git add src/editor-drop-target.ts
git commit -m "feat: add editor drop target for dragging an image out of a group"
```

---

### Task 5: `main.ts` 注册新功能

**Files:**
- Modify: `main.ts`

**Interfaces:**
- Consumes: `registerEditorDropTarget(plugin: ImgRowPlugin): void`（来自 Task 4 的 `./src/editor-drop-target`）
- Produces: 无（插件入口装配）

- [ ] **Step 1: 增加 import 并注册**

把文件顶部的：

```ts
import { Plugin } from "obsidian";
import { addImageLayoutMarkdownProcessor } from "./src/render/processor";
import { registerEditorMenu } from "./src/editor-menu";
import { registerHoverGroupTrigger } from "./src/hover-group-trigger";
import { registerImageDragSource } from "./src/image-drag-source";
import { ImgRowPluginSettings, DEFAULT_SETTINGS, ImgRowSettingTab, applySettingsToConfig } from "./src/settings";
```

改为：

```ts
import { Plugin } from "obsidian";
import { addImageLayoutMarkdownProcessor } from "./src/render/processor";
import { registerEditorMenu } from "./src/editor-menu";
import { registerHoverGroupTrigger } from "./src/hover-group-trigger";
import { registerImageDragSource } from "./src/image-drag-source";
import { registerEditorDropTarget } from "./src/editor-drop-target";
import { ImgRowPluginSettings, DEFAULT_SETTINGS, ImgRowSettingTab, applySettingsToConfig } from "./src/settings";
```

把 `onload` 里的：

```ts
		// 注册独立图片拖入已有图片组的功能
		registerImageDragSource(this);
		// 注册设置页
		this.addSettingTab(new ImgRowSettingTab(this.app, this));
```

改为：

```ts
		// 注册独立图片拖入已有图片组的功能
		registerImageDragSource(this);
		// 注册"拖出图片组"落到编辑器空白处的功能
		registerEditorDropTarget(this);
		// 注册设置页
		this.addSettingTab(new ImgRowSettingTab(this.app, this));
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 退出码 0，无 tsc 报错。

- [ ] **Step 3: Commit**

```bash
git add main.ts
git commit -m "feat: wire up editor drop target in plugin entry point"
```

---

### Task 6: `styles.css` 新增拖出插入位置的高亮样式

**Files:**
- Modify: `styles.css:10-14`

**Interfaces:**
- Consumes: Task 4 产出的 class 名称 `plugin-image-dragline-before` / `plugin-image-dragline-after`（必须完全一致）
- Produces: 无

- [ ] **Step 1: 追加 CSS 规则**

把现有的：

```css
/* 拖拽排序 */
.plugin-image-sortable       { cursor: grab; }
.plugin-image-dragging       { opacity: 0.35; }
.plugin-image-drag-before    { box-shadow: -3px 0 0 0 var(--interactive-accent, #5677c0); }
.plugin-image-drag-after     { box-shadow:  3px 0 0 0 var(--interactive-accent, #5677c0); }
```

改为：

```css
/* 拖拽排序 */
.plugin-image-sortable       { cursor: grab; }
.plugin-image-dragging       { opacity: 0.35; }
.plugin-image-drag-before    { box-shadow: -3px 0 0 0 var(--interactive-accent, #5677c0); }
.plugin-image-drag-after     { box-shadow:  3px 0 0 0 var(--interactive-accent, #5677c0); }

/* 从图片组拖出图片时，编辑器目标行的插入位置提示（上方/下方） */
.plugin-image-dragline-before { box-shadow: 0 -3px 0 0 var(--interactive-accent, #5677c0); }
.plugin-image-dragline-after  { box-shadow: 0  3px 0 0 var(--interactive-accent, #5677c0); }
```

- [ ] **Step 2: 类型检查（确认没有破坏构建）**

Run: `pnpm build`
Expected: 退出码 0，无报错（CSS 改动不会影响 tsc/esbuild，但仍按统一流程跑一遍确认没有误改别的文件）。

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add drop-line indicator for dragging an image out of a group"
```

---

### Task 7: `src/settings.ts` 更新开关文案为双向描述

**Files:**
- Modify: `src/settings.ts:109-119`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯文案变更，`enableDragToGroup` 字段名/行为不变）

- [ ] **Step 1: 修改文案**

把：

```ts
        new Setting(containerEl)
            .setName("Drag image into group")
            .setDesc("Allow dragging a standalone image (Live Preview) into an existing image group.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableDragToGroup)
                    .onChange(async value => {
                        this.plugin.settings.enableDragToGroup = value;
                        await this.plugin.saveSettings();
                    })
            );
```

改为：

```ts
        new Setting(containerEl)
            .setName("Drag images in/out of groups")
            .setDesc("Allow dragging a standalone image (Live Preview) into an existing image group, and dragging an image out of a group back into the editor.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableDragToGroup)
                    .onChange(async value => {
                        this.plugin.settings.enableDragToGroup = value;
                        await this.plugin.saveSettings();
                    })
            );
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 退出码 0，无 tsc 报错。

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "docs: describe drag-to-group setting as bidirectional"
```

---

### Task 8: 构建、部署到本地 vault 并手动验证

**Files:**
- 无代码改动（构建产物 + 手动验证）

**Interfaces:**
- Consumes: 全部前置任务的完整构建产物 `main.js`
- Produces: 无

- [ ] **Step 1: 生产构建**

Run: `pnpm build`
Expected: 退出码 0，生成/更新根目录下的 `main.js`。

- [ ] **Step 2: 部署到本地 vault**

```bash
mkdir -p "/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/image-cluster"
cp main.js manifest.json styles.css "/Users/tcyeee/Library/Mobile Documents/iCloud~md~obsidian/Documents/Lucas/.obsidian/plugins/image-cluster/"
```

Expected: 三个文件复制成功；该插件已在目标 vault 启用，Obsidian 的 hot-reload 插件会自动重载，无需手动在设置里启用。

- [ ] **Step 3: 手动验证清单**

在 Obsidian 中打开该 vault，新建一个测试笔记，构造至少一个含 3 张图片的 `` ```imgs `` 图片组和几行普通正文，依次验证（对应设计文档的测试计划）：

1. 从 3 张图的图片组拖出 1 张，松手在图片组下方的正文行上 → 该行下方插入 1 行独立图片，原图片组剩 2 张，代码块 fence 保留。
2. 图片组恰好 2 张时拖出 1 张 → 剩余 1 张自动拆包成一行普通图片，代码块 fence 消失。
3. 图片组恰好 1 张时拖出这唯一 1 张 → 原代码块整体消失，目标位置出现这行图片。
4. 分别在目标行的上半区/下半区松手 → 插入位置分别在该行之前/之后，符合预期。
5. 把图片拖到另一个已有图片组内部松手 → 无变化（不产生插入，也不报错）。
6. 在设置页把 "Drag images in/out of groups" 关闭后 → 图片组内的图片不能再被拖出（也不能把独立图片拖入图片组），但图片组内部的拖拽排序（换位置）仍然正常工作。
7. 打开开发者工具 Console（`Cmd+Option+I`），完成上述 1-6 步操作过程中不出现红色报错。

Expected: 以上 7 项全部符合预期。若有偏差，记录具体现象，回到对应 Task 修正代码后重新执行 Step 1-3。

- [ ] **Step 4: Commit（若手动验证中发现需要修复的问题）**

如果 Step 3 发现问题并修复了代码，按标准流程创建修复 commit（含具体改动文件），信息前缀使用 `fix:`。若验证全部通过、无需改动，本任务无需额外 commit。
