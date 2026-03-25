import { TFile } from "obsidian";
import { SettingOptions } from "./domain";
import ImgRowPlugin from "main";
import { config } from "./config";
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
 */
export function imgsWrapper(imageSyntax: string): string {
  const trimmed = imageSyntax.trim();
  return "```imgs\n" + trimmed + "\n```";
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
 * 统一修改元素的内联样式属性，方便以后替换为 CSS 变量或其他方案。
 */
export function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  Object.entries(props).forEach(([key, value]) => {
    el.style.setProperty(key, value);
  });
}

/**
 * 解析代码块内部的配置行
 * @param source - 代码块内容
 * 
 * 配置行格式：
 *   size=220&gap=10&radius=10&shadow=false&border=false&hidden=false&limit=false;;
 *   ![img](...)
 * 
 * 返回配置对象：
 *   { size: 220, gap: 10, radius: 10, shadow: false, border: false, hidden: false, limit: false }
 */
export function parseStyleOptions(source: string): SettingOptions {
  const settings = new SettingOptions();
  if (!source.includes(";;")) return settings;

  const parts = source.split(";;").map(part => part.trim());
  const styleLines = parts[0].split("&");

  for (const line of styleLines) {
    const [key, value] = line.split("=").map(s => s.trim());
    if (!key || value === undefined) continue;

    if (["size", "gap", "radius"].includes(key)) {
      const num = Number(value);
      if (key == "size" && num >= 50 && num <= 500) settings.size = num;
      if (key == "gap" && num >= 0 && num <= 50) settings.gap = num;
      if (key == "radius" && num >= 0 && num <= 50) settings.radius = num;
    }
    if (key == "shadow") settings.shadow = value.toLowerCase() === "true";
    if (key == "border") settings.border = value.toLowerCase() === "true";
    if (key == "hidden") settings.hidden = value.toLowerCase() === "true";
    if (key == "limit") settings.limit = value.toLowerCase() === "true";
  }
  return settings;
}


// 记录当前正在生成的缩略图路径，避免并发情况下对同一文件重复 createBinary 导致 "File already exists."
const generatingThumbnails = new Set<string>();

/**
 * 如果指定路径下还不存在缩略图，则：
 * 1. 读取原图（通过 vault.getResourcePath）
 * 2. 使用 canvas 根据指定尺寸生成缩略图
 * 3. 写入 vault 的 cache 目录
 * 4. 生成完成后，刷新传入 img 元素的 src
 */
export async function ensureThumbnailForFile(plugin: ImgRowPlugin, file: TFile, thumbPath: string, imgEl: HTMLImageElement): Promise<void> {
  // 避免同一缩略图被并发生成（多次渲染同一代码块 / 快速切换视图时可能发生）
  if (generatingThumbnails.has(thumbPath)) {
    return;
  }
  generatingThumbnails.add(thumbPath);

  try {
    // 再次检查，避免并发情况下重复生成
    const existed = plugin.app.vault.getAbstractFileByPath(thumbPath);
    if (existed instanceof TFile) {
      imgEl.src = plugin.app.vault.getResourcePath(existed);
      return;
    }

    // 兼容旧版本：如果之前是通过 adapter 直接写入文件，Vault 里还没有对应的 TFile，
    // 此时磁盘上已经有同名文件，但 getAbstractFileByPath 返回 null。
    // 为了避免反复触发 "File already exists." 报错，这里如果检测到磁盘上已有文件，
    // 就直接跳过生成逻辑，等 Obsidian 后台索引完毕后再正常使用。
    const existsOnDisk = await plugin.app.vault.adapter.exists(thumbPath);
    if (existsOnDisk) {
      return;
    }

    const originalSrc = plugin.app.vault.getResourcePath(file);

    const image = new Image();
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = (e) => {
        if (e instanceof ErrorEvent && e.error instanceof Error) {
          reject(e.error);
        } else {
          reject(new Error(`Failed to load image: ${originalSrc}`));
        }
      };
    });
    image.src = originalSrc;

    const loadedImg = await loadPromise;

    // 目标缩略图为正方形：以较短边为边长进行居中裁剪，然后缩放到 targetSize（带上下限）
    const targetSide = Math.max(50, config.THUMBNAIL_SIZE);
    const { width, height } = loadedImg;
    if (!width || !height) return;

    const cropSize = Math.min(width, height);
    const sx = (width - cropSize) / 2;
    const sy = (height - cropSize) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = targetSide;
    canvas.height = targetSide;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(loadedImg, sx, sy, cropSize, cropSize, 0, 0, targetSide, targetSide);

    // 缩略图统一生成为 JPG 格式
    const mimeType = "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, config.THUMBNAIL_QUALITY),
    );
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();

    // 确保目录存在
    const parts = thumbPath.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      if (dir) {
        await plugin.app.vault.adapter.mkdir(dir);
      }
    }

    // 使用 Obsidian Vault API 创建/更新二进制文件，确保新文件立刻被 Vault 识别
    let newThumb: TFile;
    const existedAfterMkdir = plugin.app.vault.getAbstractFileByPath(thumbPath);
    if (existedAfterMkdir instanceof TFile) {
      await plugin.app.vault.modifyBinary(existedAfterMkdir, arrayBuffer);
      newThumb = existedAfterMkdir;
    } else {
      newThumb = await plugin.app.vault.createBinary(thumbPath, arrayBuffer);
    }

    // 写入完成后，刷新 img 的 src 指向新生成的缩略图
    imgEl.src = plugin.app.vault.getResourcePath(newThumb);
  } catch (error) {
    // 如果只是并发场景下偶发的 "File already exists."，尝试直接复用已存在文件，并不视为真正错误
    if (error instanceof Error && error.message === "File already exists.") {
      const existedNow = plugin.app.vault.getAbstractFileByPath(thumbPath);
      if (existedNow instanceof TFile) {
        imgEl.src = plugin.app.vault.getResourcePath(existedNow);
        return;
      }
    }
    console.error("Failed to generate thumbnail for", file.path, error);
  } finally {
    generatingThumbnails.delete(thumbPath);
  }
}


/**
 * 计算字符串的 MD5（用于根据源文件路径生成稳定的缩略图文件名）。
 * 实现为纯前端版本，避免额外依赖。
 */
export function md5(input: string): string {
  // 参考经典 MD5 算法实现，对 UTF-16 字符逐字节处理即可满足路径哈希的需求
  function rotateLeft(lValue: number, iShiftBits: number): number {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }

  function addUnsigned(lX: number, lY: number): number {
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) {
      return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    }
    if (lX4 | lY4) {
      if (lResult & 0x40000000) {
        return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      }
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }

  function F(x: number, y: number, z: number): number {
    return (x & y) | (~x & z);
  }
  function G(x: number, y: number, z: number): number {
    return (x & z) | (y & ~z);
  }
  function H(x: number, y: number, z: number): number {
    return x ^ y ^ z;
  }
  function I(x: number, y: number, z: number): number {
    return y ^ (x | ~z);
  }

  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }

  function convertToWordArray(str: string): number[] {
    const lWordArray: number[] = [];
    const lMessageLength = str.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    let lBytePosition = 0;
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }
    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }

  function wordToHex(lValue: number): string {
    let wordToHexValue = "";
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const hex = `0${lByte.toString(16)}`.slice(-2);
      wordToHexValue += hex;
    }
    return wordToHexValue;
  }

  // 主流程
  const x = convertToWordArray(input);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a;
    const BB = b;
    const CC = c;
    const DD = d;

    a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], 17, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], 17, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], 17, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], 22, 0x49b40821);

    a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], 14, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], 9, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], 14, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], 23, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);

    a = II(a, b, c, d, x[k + 0], 6, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], 10, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], 15, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], 15, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], 15, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], 21, 0xeb86d391);

    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
