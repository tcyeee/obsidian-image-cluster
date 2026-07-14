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
  const imageRegex = /!\[[^\]]*\]\([^)]*\)|!\[\[.*?\]\]/g;
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
 *
 * 注意 Markdown 语法这一半用的是 [^\]] / [^)]，而不是看起来更简洁的 .*?：
 * 如果一行先写了一个 Wiki 链接、后面再跟一个 Markdown 语法的图片
 * （如 "![[a.png]] and ![b](b.png)"），.*? 惰性匹配仍然会越过 Wiki 链接自己的 ]]，
 * 一路扩张到后面 Markdown 图片的 "](" 才停下，导致整段被当成一个匹配，
 * 中间的 Wiki 图片被吞并、后面的 Markdown 图片也定位不到。限制字符类使其不能跨越
 * "]" / ")" 边界，就不会再吃到别的图片语法里去。
 */
export function getImageMatches(line: string): ImageMatch[] {
  const imageRegex = /!\[[^\]]*\]\([^)]*\)|!\[\[.*?\]\]/g;
  const matches: ImageMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(line)) !== null) {
    matches.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

export interface ImagePathMatch {
  /** 该图片语法在行内的完整原始文本，如 "![[a.png]]" */
  text: string;
  /** 从语法中提取出的实际文件路径（Wiki 链接已剥离 |别名 与 #锚点 部分） */
  rawPath: string;
}

/**
 * 提取一行中全部图片语法及各自对应的实际文件路径。
 * 与 getImageMatches 的区别：这里同时解析出路径，供渲染阶段逐张解析文件用——
 * 一行可能写了不止一张图片（正常操作不会产生这种行，但手动编辑可能），
 * 需要把每一张都解析出来渲染，而不是像单次 .exec() 那样只拿到第一张。
 */
export function getImagePathMatches(line: string): ImagePathMatch[] {
  // 见 getImageMatches 顶部注释：Markdown 语法这一半必须用 [^\]] / [^)]，
  // 不能用 .*?，否则前面有 Wiki 链接、后面跟 Markdown 图片时会越界吞并成一个匹配。
  const imageRegex = /!\[[^\]]*\]\(([^)]*)\)|!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g;
  const results: ImagePathMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(line)) !== null) {
    const rawPath = match[1] !== undefined ? match[1] : (match[2] ?? "").trim();
    results.push({ text: match[0], rawPath });
  }
  return results;
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
