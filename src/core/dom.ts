/**
 * 批量设置元素上的 CSS 自定义属性（--xxx 变量）。
 * 只应传入 CSS 变量；静态样式请用 class 控制，避免内联样式。
 */
export function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  // 走 Obsidian 在 HTMLElement 上提供的 setCssProps，而不是自己 el.style.setProperty——
  // 后者属于「直接写内联样式」，会被插件审核的 no-static-styles-assignment 命中。
  el.setCssProps(props);
}
