/**
 * 批量设置元素上的 CSS 自定义属性（--xxx 变量）。
 * 只应传入 CSS 变量；静态样式请用 class 控制，避免内联样式。
 */
export function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  Object.entries(props).forEach(([key, value]) => {
    el.style.setProperty(key, value);
  });
}
