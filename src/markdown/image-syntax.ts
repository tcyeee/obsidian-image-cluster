/**
 * 将单行图片语法包装成 ```imgs 代码块。
 *
 * 输入示例：
 *   "![|406x259](/assets/20251128083922.png)"
 *
 * 返回示例（字符串中真实包含换行符，而不是缩进）：
 *   ```imgs
 *   ![|406x259](/assets/20251128083922.png)
 *   ```
 *
 * @param paddingLeft - 左侧内移像素（>0 时在配置行中加入 padding-left=<px>；单位 px）
 */
export function imgsWrapper(imageSyntax: string, paddingLeft = 0): string {
  const trimmed = imageSyntax.trim();
  const configLine = paddingLeft > 0 ? `padding-left=${paddingLeft};;\n` : "";
  return "```imgs\n" + configLine + trimmed + "\n```\n";
}

/**
 * 检测某行文本是否为列表项（bullet / numbered / task list）。
 */
export function isListLine(line: string): boolean {
  return /^\s*([-*+]|\d+\.)\s/.test(line);
}

/**
 * 提取当前行中的全部图片语法文本：
 * - 普通 Markdown： ![alt](path)
 * - 内部资源： ![[file.png]]
 */
export function getImageSyntaxes(line: string): string {
  const imageSyntaxes: string[] = [];
  const imageRegex = /!\[.*?\]\((.*?)\)|!\[\[.*?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(line)) !== null) {
    imageSyntaxes.push(match[0]);
  }
  return imageSyntaxes.length > 0 ? imageSyntaxes.join("\n") : line;
}

/**
 * 简单识别当前行是否包含图片语法：
 * - 普通 Markdown： ![alt](path)
 * - 内部资源： ![[file.png]]
 * @param line - 当前行文本
 * @returns 如果包含，则返回 true，否则返回 false。
 */
export function hasMarkdownImage(line: string): boolean {
  return /!\[.*?\]\((.*?)\)/.test(line) || /!\[\[.*?\]\]/.test(line);
}

/**
 * 判断某行是否「只包含一张图片」（不多不少）。
 * 用于拖拽场景：整行删除是安全的，前提是这一行不含其他图片或有意义的正文内容。
 */
export function isSingleImageLine(line: string): boolean {
  const imageRegex = /!\[.*?\]\((.*?)\)|!\[\[.*?\]\]/g;
  const matches = line.match(imageRegex);
  if (!matches || matches.length !== 1) return false;
  // 去掉图片语法和列表标记（- / * / + / 1.）后，剩余内容应为空，避免误删同一行的其他文本
  const remainder = line.replace(imageRegex, "").replace(/^\s*([-*+]|\d+\.)\s*/, "").trim();
  return remainder.length === 0;
}
