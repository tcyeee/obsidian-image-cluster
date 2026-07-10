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

export interface ImageMatch {
  /** 图片语法本身的文本，如 "![[a.png]]" */
  text: string;
  /** 在行内的起始字符偏移（含） */
  start: number;
  /** 在行内的结束字符偏移（不含） */
  end: number;
}

/**
 * 提取一行中全部图片语法及其在行内的起止字符偏移。
 * 用于拖拽场景精确定位「这一行里第几张图片」——同一行可能写了不止一张图片。
 */
export function getImageMatches(line: string): ImageMatch[] {
  const imageRegex = /!\[.*?\]\((.*?)\)|!\[\[.*?\]\]/g;
  const matches: ImageMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(line)) !== null) {
    matches.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

/**
 * 从一行文本中移除指定下标的一张图片语法，同一行内其他图片/文字原样保留。
 * 用于「拖出同一行内多张图片中的一张」，也兼容「整行本来就只有这一张图片」的旧场景
 * ——此时 empty 为 true，调用方应当把整行一并删除，而不是留下一个空行。
 *
 * @param matchIndex - 目标图片在 getImageMatches(line) 结果中的下标（0 基）
 * @returns text - 移除后剩余的行文本（已合并多余空白并 trim）
 *          empty - 去掉图片语法和列表标记（- / * / + / 1.）后是否再无有意义内容
 */
export function removeImageFromLine(line: string, matchIndex: number): { text: string; empty: boolean } {
  const matches = getImageMatches(line);
  const target = matches[matchIndex];
  if (!target) return { text: line, empty: false };

  const removed = (line.slice(0, target.start) + line.slice(target.end)).replace(/[ \t]+/g, " ").trim();
  const withoutListMarker = removed.replace(/^\s*([-*+]|\d+\.)\s*/, "").trim();
  return { text: removed, empty: withoutListMarker.length === 0 };
}
