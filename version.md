# obsidian-image-cluster 更新日志

## 1.4.2 · 2026-08-15

- The hover action bars now match Obsidian's native ones: both the image group's own bar and the per-image "remove / delete" bar get the same frosted backdrop panel, button size, corner radius, hover highlight and mobile touch sizing as the buttons on a plain image embed
- Replaced the dark gradient that used to wash over the bottom of a thumbnail on hover with the standard top-right button bar, so hovering a single image and hovering an image group no longer look like two different plugins in the same note
- All of the above reads Obsidian's own `--embed-actions-*` variables, so themes that restyle those buttons restyle these too
- 悬停操作按钮栏改为与 Obsidian 原生一致：图片组自身的按钮栏和组内单图的「排除 / 删除」按钮栏，都用上和普通图片 embed 相同的毛玻璃背景板、按钮尺寸、圆角、悬停高亮与移动端触控尺寸
- 缩略图悬停时不再压一层从下往上的黑色渐变，改为右上角的标准按钮栏，同一篇笔记里悬停单张图片和悬停图片组不会再像两个插件
- 以上取值全部走 Obsidian 自己的 `--embed-actions-*` 变量，主题改了原生按钮样式，这里会跟着一起变

---

## 1.4.1 · 2026-08-15

- Replaced `display: contents` on the settings-button wrapper with a shrink-to-fit flex box: the layout is identical, but `display: contents` is only partially supported by the Electron build Obsidian ships and was flagged during plugin review
- Narrowed the orphaned-thumbnail-cache scan to image files only, so the plugin no longer reads the paths of notes and other attachments while looking for stale cache entries
- The delete-confirmation dialog now uses Obsidian's native modal title bar instead of a hand-built heading
- Rewrote the README and its Chinese translation with clearer installation instructions
- 设置按钮的包装元素改用「恰好包住按钮」的 flex 盒子替代 `display: contents`：排版结果完全一致，但 `display: contents` 在 Obsidian 当前的 Electron 版本里只是部分支持，提交审核时会被标记
- 清理孤儿缩略图缓存时只遍历图片文件，不再读取笔记和其他附件的路径
- 删除确认弹窗改用 Obsidian 原生的弹窗标题栏，不再自己拼标题元素
- 重写 README 及中文版，安装步骤更清晰

---

## 1.4.0 · 2026-08-15

- Adapted to Obsidian 1.13: both injected buttons now live in the native `.embed-actions` bar next to the edit button, inheriting its positioning, fade-in and mobile touch sizing — minAppVersion is therefore raised to 1.13.4
- Migrated the settings tab to the declarative `getSettingDefinitions()` API so each setting is reachable from Obsidian's settings search
- Sharpened thumbnails on high-DPI screens by generating them at the display size multiplied by devicePixelRatio (capped at 2x), keying the cache on that resolution and trashing the pre-DPR cache entry
- Added a command to clean up orphaned thumbnail cache files left behind while the plugin was not running
- Reading mode no longer shows any editing affordance: the per-image hover overlay with its exclude/delete buttons is hidden along with the settings button
- Fixed the settings button appearing to do nothing when clicked in Live Preview, caused by the panel being positioned off-screen from a zero-sized `display: contents` wrapper
- Fixed handling of lines containing several images, image paths that are not valid percent-encoding, and thumbnail cache entries orphaned by native renames
- 适配 Obsidian 1.13：两个注入按钮改为放进原生 `.embed-actions` 按钮栏、与编辑按钮并排，定位、淡入、移动端触控尺寸全部继承官方样式——minAppVersion 相应提升到 1.13.4
- 设置页迁移到声明式的 `getSettingDefinitions()` API，每个设置项都能被 Obsidian 的设置搜索找到
- 优化高分屏下的缩略图清晰度：按展示尺寸 × devicePixelRatio（封顶 2x）生成，缓存 key 带上该分辨率，并顺手清理升级前遗留的旧缓存
- 新增清理孤儿缩略图缓存的命令，覆盖插件未运行期间产生的残留文件
- 阅读模式下不再显示任何编辑入口：单图悬停蒙层及其「排除 / 删除」按钮与设置按钮一并隐藏
- 修复 Live Preview 下点击设置按钮没有反应的问题：面板位置取自带 `display: contents` 的包装元素，其尺寸恒为 0，导致面板被定位到视口外
- 修复同一行写有多张图片、图片路径不是合法百分号编码、以及原生重命名导致缩略图缓存变成孤儿这几种情况的处理

---

## 1.3.7 · 2026-07-10

- Added exclude/delete actions shown on hover for images inside a group, with a confirmation dialog when deleting an image still referenced elsewhere in the vault
- Added support for dragging a single image out of a line that contains multiple images, without disturbing the other images on that line
- Grouped the image settings panel into labeled sections (Canvas size / Appearance) for clarity
- Fixed several strict type-safety lint warnings (tsconfig `lib` version, popout-window event targets, DOM type narrowing)
- 新增图片组内单图 hover 时的「排除」「删除」操作，删除仍被 vault 中其他地方引用的原图时会先弹窗确认
- 新增精确拖出「同一行内多张图片中的一张」的支持，不再影响该行内的其他图片
- 设置面板按分组加上标题（Canvas size / Appearance），层次更清晰
- 修复若干严格类型检查 lint 警告（tsconfig `lib` 版本、弹出窗口事件目标、DOM 类型收窄）

---

## 1.3.6 · 2026-07-09

- Fixed dragging an image into a group repeatedly failing/duplicating the image due to a stale-read race against the live editor buffer
- Added an option to trim solid-color borders (e.g. black canvas padding) from generated thumbnails before cropping
- Changed the Group button to appear on focus (matching the native edit button) instead of hover, and fixed its behavior in popout windows
- 修复连续拖入图片到图片组时因读取到过期文件内容而导致的失败/重复图片问题
- 新增缩略图生成时裁剪纯色边框（如黑色画布留白）的选项
- 将 Group 按钮的触发条件由悬停改为聚焦（与原生编辑按钮保持一致），并修复其在弹出窗口中的行为

---

## 1.3.5 · 2026-06-30

- Added automatic thumbnail generation to speed up rendering of image clusters, with concurrency handling
- Added a left-padding option to adjust the indentation of the image container
- Improved the editor menu item title and fixed setting panel positioning in popout windows
- 新增自动生成缩略图功能，加速图片组的渲染，并带有并发控制
- 新增左侧内边距选项，可调整图片容器的缩进
- 优化编辑器菜单项标题，修复弹出窗口中设置面板的定位

---

## 1.3.4 · 2026-05-24

- Fixed image file lookup to use `getAbstractFileByPath` instead of scanning all vault files
- Fixed settings icon to use Obsidian's built-in `setIcon` API for proper theme support
- 修复图片文件查找：改用 `getAbstractFileByPath`，避免全量扫描 vault 文件
- 修复设置图标：改用 Obsidian 内置 `setIcon` API，正确适配主题配色

---

## 1.3.3 · 2026-05-24

**What's new:**
- Migrated build toolchain from npm to pnpm
- Refactored all DOM creation to use Obsidian's built-in helpers (`createDiv`, `createEl`, `createSpan`) instead of `document.createElement`
- Replaced global `window.setTimeout` and `document.body` with `activeWindow` and `activeDocument` for proper multi-window support

**更新内容：**
- 构建工具链从 npm 迁移至 pnpm
- 将所有 DOM 创建重构为使用 Obsidian 内置辅助函数（`createDiv`、`createEl`、`createSpan`）替代 `document.createElement`
- 将全局 `window.setTimeout` 和 `document.body` 替换为 `activeWindow` 和 `activeDocument`，正确支持多窗口场景

---

## 1.3.2 · 2026-03-26

**What's new:**
- Fixed "+N" mask click not dismissing the limit — images now correctly expand when tapped
- Added support for Obsidian wiki-link syntax (`![[image.png]]`) inside `imgs` code blocks
- Fixed memory leaks: floating setting panels and document click listeners are now properly cleaned up on re-render and plugin unload
- Fixed scroll-to-zoom: zoom now centers on the cursor position instead of the image center
- Fixed pinch-to-zoom: zoom now centers on the midpoint between two fingers
- Fixed floating-point accumulation in scroll zoom steps

**更新内容：**
- 修复点击「+N」蒙版无法关闭行数限制的问题
- 支持在 `imgs` 代码块中使用 Obsidian 内部链接格式（`![[image.png]]`）
- 修复内存泄漏：设置面板和 document 事件监听器现在会在重新渲染及插件卸载时正确清理
- 修复滚轮缩放：现在以鼠标光标位置为缩放中心，不再以图片中心为基准
- 修复双指捏合缩放：现在以两指中点为缩放中心
- 修复滚轮缩放步长的浮点数精度问题

---

## 1.3.1 · 2026-03-25

**What's new:**
- Fixed magnification issues with long screenshots  
- Added the function of dragging and sorting image groups

**Installation:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create the folder `<Vault>/.obsidian/plugins/obsidian-image-cluster/` and place the three files inside.
3. In Obsidian, go to **Settings → Community plugins → Installed plugins** and enable **Image Cluster**.

---

**更新内容：**
- 新增图片组拖动排序功能
- 修复长截图放大倍率问题

**安装方式：**
1. 从最新 Release 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在 Vault 中创建文件夹 `<Vault>/.obsidian/plugins/obsidian-image-cluster/`，将三个文件放入其中。
3. 打开 Obsidian，进入 **设置 → 第三方插件 → 已安装插件**，启用 **Image Cluster**。

---

## 1.3.0 · 2026-03-22

**更新内容**

- Disable hover CSS styles on the image group action panel  
- In edit mode, the cursor should be a pointer when hovering over an image group (currently shows the text-edit cursor)  
- In edit mode, the image group settings popover is clipped — content outside the group bounds gets cut off  
- In edit mode, allow drag-and-drop reordering of images within a group  
- In fullscreen preview, allow panning after zooming in on an image  
- In fullscreen preview, add a slide animation when switching between images  
- Add a settings page to configure default thumbnail size, border visibility, and shadow visibility  

**中文说明**

- 禁用图片组操作面板中，鼠标悬浮的 CSS 样式  
- 在编辑模式下，鼠标移动到图片组上时，鼠标应为指针样式（当前为文本编辑样式）  
- 在编辑模式下，图片组设置弹窗无法完整显示，超出图片组的部分会被截断  
- 在编辑模式下，图片组允许通过鼠标拖动进行排序  
- 在大图全屏预览时，图片放大以后允许拖动查看  
- 在大图全屏预览时，左右切换图片时添加动画效果  
- 添加设置页，可设置默认预览图大小、是否显示边框、是否显示阴影  

---

## 1.2.0 · 2025-11-30

**更新内容**

1. Fixed an issue where hidden images were still clickable.  
   - This update ensures that any image set to “hidden” no longer responds to user interactions.
2. Added the new “Limit” feature.  
   - Users can now click the Limit control to restrict the number of visible rows for images within each group, providing a cleaner and more manageable viewing experience.

---

## 1.1.0 · 2025-11-29

**更新内容**

1. Added image caching to prevent loading issues caused by large numbers of images.  
2. Added image hiding functionality, allowing users to hide sensitive or inappropriate image groups with one click.

---

## 1.0.0 · 2025-11-28

**更新内容**

1. Complete the image preview function.  
2. Complete the Quick Create Picture Group feature.