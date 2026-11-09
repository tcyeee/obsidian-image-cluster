# 如何在图片区域禁用 Obsidian 的系统内置右键菜单

本文记录本插件在图片组渲染区域内，如何彻底屏蔽 Obsidian 原生的「用默认应用打开 / 在系统访达中显示」右键菜单，
改用插件自己的自定义菜单。核心难点不是"怎么弹出自己的菜单"，而是"怎么确保原生菜单完全不出现"——
这两者看似一回事，实际要解决三个独立的问题。

## 问题背景

Obsidian 近期版本会在 `document`（或更内层的祖先节点，比如 `.markdown-preview-sizer`）上挂一个
**捕获阶段（capture phase）** 的 `contextmenu` 监听，用来弹出它自己的原生菜单。这个监听读取的是
触发事件的 `<img>` 自身的 `src`。

如果你只是简单地在图片元素上 `img.addEventListener("contextmenu", ...)`（冒泡阶段），会遇到三个问题：

1. **时序问题**：Obsidian 的监听是捕获阶段，且挂在比你的图片更外层的祖先节点（`document` 或更高）。
   捕获阶段的执行顺序由 DOM 深度决定，不是按注册时间——父节点的捕获监听必然先于子节点触发。
   冒泡阶段的监听永远排在所有捕获阶段监听之后，这时原生菜单可能已经在同步代码里创建完毕，
   你再调用 `stopPropagation()` 也无法撤销，导致两个菜单重叠出现。

2. **命中目标问题**：如果图片上盖了一层遮罩（比如本插件"+N 张"的蒙版、或任何 `pointer-events` 覆盖层），
   右键事件的 `event.target` 会是遮罩本身而不是 `<img>`，任何只认 `target instanceof HTMLImageElement`
   的逻辑都会被跳过。

3. **空白区域问题**：图片组容器内，图片与图片之间、容器内边距等空白处右键时，事件会一路冒泡到更外层的
   祖先节点，同样可能触发 Obsidian 或其他插件注册的菜单。

## 解决方案：三层拦截

### 1. 图片本身——把拦截点上移到 `window` 捕获阶段

关键认知：**捕获阶段顺序按 DOM 深度决定，和谁先注册无关**。`window` 是比 `document` 更外层的节点，
所以只要在 `window` 上挂一个捕获阶段的 `contextmenu` 监听，就一定会比 Obsidian 挂在 `document`
（或更深祖先）上的监听先执行，从而能在原生菜单被创建之前拦截掉事件。

```ts
// src/render/image.ts

// 每张图片对应的右键菜单上下文，用 window 级捕获监听统一查表触发。
const imageContextMenuData = new WeakMap<HTMLImageElement, ImageContextMenuData>();
// 同一个 window（含弹出窗口各自的 window）只挂一次捕获监听，避免每张图片重复注册。
const contextMenuCaptureInstalled = new WeakSet<Window>();

function handleCaptureContextMenu(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    const data = imageContextMenuData.get(target);
    if (!data) return;
    e.preventDefault();
    e.stopPropagation();
    openImageContextMenu(e.clientX, e.clientY, /* ...data */);
}

function ensureContextMenuCapture(win: Window): void {
    if (contextMenuCaptureInstalled.has(win)) return;
    contextMenuCaptureInstalled.add(win);
    win.addEventListener("contextmenu", handleCaptureContextMenu, { capture: true });
}
```

每张 `<img>` 创建时，不直接挂监听，而是把它的上下文数据登记进 `WeakMap`，并确保它所在的
`window`（注意 Obsidian 支持弹出窗口，`ownerDocument.defaultView` 可能不是主窗口）已经安装了
捕获监听：

```ts
imageContextMenuData.set(img, { plugin, file, wrapper, container, ctx, el, option, isVideo });
const win = img.ownerDocument.defaultView;
if (win) ensureContextMenuCapture(win);
```

用 `WeakMap`/`WeakSet` 是为了让图片或窗口被销毁时登记信息能被自动回收，不需要手动清理。

### 2. 被遮罩盖住的图片——按需转发，而不是依赖 `target`

当图片上叠了一层遮罩（例如"+N 张"蒙版），右键事件的 `target` 是遮罩，不会命中上面的
`handleCaptureContextMenu`（它只认 `HTMLImageElement`）。解法是在遮罩自己身上单独挂一个
`contextmenu` 监听，手动找到遮罩下面对应的 `<img>`，按同一张图片登记的数据去弹出菜单：

```ts
// src/render/layout.ts
mask.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const img = el.querySelector<HTMLImageElement>("img.plugin-image");
    if (img) openContextMenuForImage(img, event.clientX, event.clientY);
});
```

```ts
// src/render/image.ts
export function openContextMenuForImage(img: HTMLImageElement, x: number, y: number): void {
    const data = imageContextMenuData.get(img);
    if (!data) return;
    openImageContextMenu(x, y, /* ...data */);
}
```

这样无论右键命中的是 `<img>` 本身还是盖在它上面的任何覆盖层，都能查到同一份菜单数据、弹出同一个自定义菜单。

### 3. 图片组内的空白区域——容器级兜底拦截

图片与图片之间的间隙、容器留白等"空白处"右键时，事件不会命中任何图片或遮罩，会直接冒泡到容器。
在容器上加一个兜底的 `contextmenu` 监听，防止它继续冒泡出去触发外层（Obsidian 或其他插件）的菜单：

```ts
// src/render/elements.ts
export function createImageContainerElement(option: SettingOptions): HTMLDivElement {
    const container = createDiv({ cls: "plugin-image-container" });
    // 图片/蒙版自身的右键菜单逻辑都会在命中时 stopPropagation，事件到不了这里；
    // 只有落在图片组间隙（容器留白、wrapper 边距等空白处）的右键才会冒泡到容器——
    // 这里统一拦截，避免误触弹出系统/Obsidian 默认菜单。
    container.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    return container;
}
```

因为前两层命中时都会 `stopPropagation()`，这个监听只会在"真正落空"的位置触发，职责很单一。

## 小结

| 命中位置 | 拦截点 | 拦截阶段 | 行为 |
|---|---|---|---|
| `<img>` 本身 | `window` | capture（比 Obsidian 的 `document` 监听更早） | 查表拿上下文，弹出自定义菜单 |
| 盖在图片上的遮罩/覆盖层 | 遮罩元素自身 | bubble | 找到底下的 `<img>`，转发给同一份菜单数据 |
| 图片组内空白处 | 图片组容器 | bubble | 单纯拦截，不弹菜单 |

三层缺一不可：只做第 1 层，遮罩/覆盖层上右键会漏网；只做第 1、2 层，图片组内空白处右键仍会冒泡出去；
只做第 3 层则图片本身和遮罩都拦不住原生菜单。核心原理只有两条：

- **捕获阶段按 DOM 深度排序，跟监听注册时间无关**——想比某个深层监听更早拿到事件，就把拦截点挂到更浅的祖先节点上（最浅是 `window`）。
- **`event.target` 是实际命中的最深元素，不一定是你逻辑上关心的元素**——任何覆盖在目标上面的遮罩都需要单独处理，不能假设 `target` 就是你期望的节点。

对应源码：`src/render/image.ts`（`handleCaptureContextMenu` / `ensureContextMenuCapture` / `openContextMenuForImage`）、
`src/render/layout.ts`（mask 的 `contextmenu` 转发，网格与瀑布流两处）、`src/render/elements.ts`
（`createImageContainerElement` 的容器级兜底）。
