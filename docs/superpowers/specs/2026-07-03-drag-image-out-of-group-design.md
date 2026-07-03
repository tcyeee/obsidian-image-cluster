# 从图片组中拖出图片 — 设计文档

日期：2026-07-03

## 背景

插件已支持「把一张独立图片拖入已有图片组」（`image-drag-source.ts` + `render/drag-sort.ts` + `drag-state.ts`）。本次要实现镜像功能：把图片组内的某张图片拖出，松手后变成编辑器中一行独立的 Markdown 图片，并从原图片组中移除。

## 范围

支持：
- 在 Live Preview 编辑模式下，从图片组容器内拖动某张图片。
- 松手释放到编辑器（`.cm-content`）内任意普通文本行上，插入为一行独立的 Markdown 图片（`![...]` 或 `![[...]]`，取原始行内容）。
- 拖出后若原图片组只剩 1 张图片，自动拆包为一行普通图片（与「悬停转组」互为逆操作）。
- 拖出后若原图片组变为 0 张图片，整个 `` ```imgs `` 代码块被删除。
- 复用现有 `enableDragToGroup` 设置开关控制启用/禁用（不新增开关）。

不支持（明确排除）：
- 跨文件拖拽（源图片组与目标编辑器必须是同一个文件）。
- 直接把图片从一个图片组拖入另一个已有图片组（组间移动）。
- 松手释放在另一个 `` ```imgs `` 代码块范围内（含原图片组自身的空白区域，因为该情形已由组内拖拽排序处理）——视为无效目标，直接忽略，不产生任何变更。

## 组件设计

### 1. `src/drag-state.ts`（扩展）

新增一路独立的拖拽状态，与现有 `StandaloneDragPayload`（拖入用）分开：

```ts
export const GROUP_IMAGE_DRAG_MIME = "application/x-imgcluster-group-image";

export interface GroupDragPayload {
    sourcePath: string;
    markdown: string;              // 被拖出图片的原始 Markdown 行
    container: HTMLDivElement;     // 所属图片组容器
    ctx: MarkdownPostProcessorContext;
    el: HTMLElement;
    wrapper: HTMLElement;          // 被拖出的 wrapper 本身
}
```

配套 `setGroupDrag` / `getGroupDrag` / `clearGroupDrag`，与现有 `currentDrag` 三件套保持同样的写法风格，但状态互相独立（一次只会有一路在进行，但不共用变量以保持语义清晰）。

使用不同的 MIME（`GROUP_IMAGE_DRAG_MIME` vs `STANDALONE_IMAGE_DRAG_MIME`）是关键：这样「拖出」不会被现有 `drag-sort.ts` 里针对 `STANDALONE_IMAGE_DRAG_MIME` 的容器级"拖入"逻辑误识别，天然排除了组间直接移动的情况（落在另一个容器上不会被任何处理器识别，不会有副作用）。

### 2. `src/render/drag-sort.ts`（扩展）

在现有 wrapper 的 `dragstart` 监听里追加：
```ts
if (plugin.settings.enableDragToGroup) {
    setGroupDrag({ sourcePath: ctx.sourcePath, markdown: wrapper.dataset.imgLine ?? "", container, ctx, el, wrapper });
    e.dataTransfer?.setData(GROUP_IMAGE_DRAG_MIME, "1");
}
```
`dragend` 监听里追加 `clearGroupDrag()`。

组内重排逻辑（拖回本组、组内换位）完全不变——它靠闭包里的 `dragSrcEl` 判断，与新状态互不干扰，drop 时仍优先命中 `if (dragSrcEl) {...}` 分支。

### 3. 新文件 `src/editor-drop-target.ts`

注册文档级 `dragover` / `drop`（`plugin.registerDomEvent(document, ...)`，与 `image-drag-source.ts` 风格一致）。只在以下条件都满足时生效：
- `e.dataTransfer.types` 包含 `GROUP_IMAGE_DRAG_MIME`；
- 落点在某个 `.cm-content` 内（Live Preview 编辑区）；
- 落点不在任何 `.plugin-image-container` 内部（用 `closest` 判断——包括原图片组自身，避免和组内拖拽排序的空白区兜底逻辑冲突）。

`dragover`：
- `e.preventDefault()`，`dropEffect = "move"`。
- 用 `EditorView.findFromDOM` 定位到所在的 CM6 编辑器实例，`view.posAtCoords({x: e.clientX, y: e.clientY})` 拿到文档位置，`view.state.doc.lineAt(pos)` 拿到目标行。
- 根据鼠标 Y 坐标落在行的上/下半区，决定插入点在该行"之前"还是"之后"，给对应 CM6 行元素加高亮 class（`plugin-image-dragline-before` / `plugin-image-dragline-after`）；先清除之前加过的高亮。

`drop`：
- `e.preventDefault()`，清除所有高亮 class。
- 用同样方式解析目标行号（0-based，`line.number - 1`）与前/后位置。
- 调用 `persistDragOutToSource(groupDrag, plugin, targetLineIndex, insertBefore)`。
- 调用 `clearGroupDrag()`。

文档级 `dragleave`（或在 `dragover` 未命中条件时）负责清掉高亮 class，避免残留；`dragend` 也做一次兜底清理（与现有 `image-drag-source.ts` 的兜底清理风格一致）。

### 4. `src/markdown/persistence.ts`（新增函数）

```ts
export async function persistDragOutToSource(
    groupDrag: GroupDragPayload,
    plugin: ImgRowPlugin,
    targetLineIndex: number,
    insertBefore: boolean,
): Promise<void>
```

算法：
1. 校验 `groupDrag.sourcePath` 与目标文件路径一致（否则直接返回，不做任何变更——理论上不会发生，因为编辑器和图片组必然同属一个打开的文件，这里只是防御）。
2. 读取源文件全文，按行拆分为 `lines`。
3. 用 `groupDrag.ctx.getSectionInfo(groupDrag.el)` 拿到原代码块的 `lineStart`（fence 开始行）/ `lineEnd`（fence 结束行）。
4. 读取 `groupDrag.container` 当前 DOM 中的全部 `.plugin-image-wrapper`，排除 `groupDrag.wrapper` 后得到剩余图片的 `dataset.imgLine` 列表：
   - **0 张剩余**：新的代码块整体内容 = 空（即整个 fence 范围被删除）。
   - **1 张剩余**：新的代码块整体内容 = 那一行图片 Markdown 本身（不带 fence，不带 config 行——自动拆包）。
   - **≥2 张剩余**：保留原 fence 行，内部内容 = 原 config 行（若有）+ 剩余图片行，与现有 `persistReorderToSource` 的重建方式一致。
5. 用 `lines.splice(fenceStart, fenceEnd - fenceStart + 1, ...newBlockLines)` 替换原代码块整个行区间，记录行数差 `delta = newBlockLines.length - (fenceEnd - fenceStart + 1)`。
6. 修正目标插入行号：若 `targetLineIndex > fenceEnd`（目标在原代码块之后），`targetLineIndex += delta`；若目标落在 `[fenceStart, fenceEnd]` 区间内，视为无效目标直接返回（理论上不会发生，因为组件 3 `editor-drop-target.ts` 已经在 DOM 层面排除了落在图片组容器内部的情况，这里只是防御）。
7. 在修正后的 `targetLineIndex`（`insertBefore` 则插入到该行之前，否则之后）插入 `groupDrag.markdown` 这一行。
8. `vault.modify(file, lines.join("\n"))` 一次性写回。写回后原图片组和编辑区会被 Obsidian 自动重新渲染，无需手动操作 DOM。

### 5. `main.ts`

新增一行：`registerEditorDropTarget(plugin);`，紧跟在 `registerImageDragSource(plugin);` 之后。

### 6. `src/settings.ts`

"Drag image into group" 一项的文案改为描述双向能力，例如：
- Name: `Drag images in/out of groups`
- Desc: `Allow dragging a standalone image into an existing image group, and dragging an image out of a group back into the editor.`

### 7. `styles.css`

新增（方向从水平改为垂直，颜色沿用现有强调色变量）：
```css
.plugin-image-dragline-before { box-shadow: 0 -3px 0 0 var(--interactive-accent, #5677c0); }
.plugin-image-dragline-after  { box-shadow: 0  3px 0 0 var(--interactive-accent, #5677c0); }
```

## 错误处理

- 目标文件与源文件不一致、目标落点解析失败（拿不到 CM6 view / line）、目标落在原/其他图片组内部：均直接忽略本次 drop，不产生任何文件写入，不抛异常（与现有拖入功能的防御风格一致）。
- `getSectionInfo` 返回空（极端情况下代码块信息拿不到）：直接返回，不写入。

## 测试计划

因为是 Obsidian 插件、依赖真实 DOM 拖拽事件与 CodeMirror 实例，缺少可自动化的单测环境（项目目前没有测试框架）。验证方式为手动在本地 vault 中操作：
1. 图片组（≥3 张）拖出 1 张到组下方空白正文行 → 该行插入独立图片，原组剩 N-1 张，fence 保留。
2. 图片组恰好 2 张，拖出 1 张 → 剩余 1 张自动拆包为独立图片行，无 fence 残留。
3. 图片组恰好 1 张，拖出这唯一 1 张 → 原代码块整体消失，目标位置出现该图片行。
4. 拖出到目标行之前 / 之后（鼠标在行上/下半区）→ 插入位置符合预期。
5. 拖出后落点若落在另一个图片组内部 → 无变化（忽略）。
6. 禁用 `enableDragToGroup` 开关后，图片组内图片不可拖出（`draggable` 行为应仍受组内排序需要，需确认排序功能不受影响，只是不触发拖出/拖入到编辑器的新逻辑）。
7. 拖出操作不影响图片组内既有的组内拖拽排序功能（回归测试）。
