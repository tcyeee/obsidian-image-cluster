# obsidian-image-cluster 更新日志

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