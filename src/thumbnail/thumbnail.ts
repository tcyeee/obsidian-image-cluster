import ImgRowPlugin from "main";
import { DataAdapter, Notice, TFile, normalizePath } from "obsidian";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, config, isVideoExtension, normalizeCacheFolderPath, runtimeDefaults } from "../core/config";
import { detectContentRect } from "./content-rect";
import { md5 } from "./md5";
import { t } from "../i18n";

// 记录每个正在生成中的缩略图路径 -> 等待这次生成结果的所有 <img> 元素。
// 避免并发情况下对同一文件重复生成，同时保证「生成期间该代码块被重渲染、传入了一个
// 新的 img 元素」时，新元素也能在生成完成后收到 src 更新，而不是只有第一次调用时
// 传入的（可能已被移除的）元素收到。
const generatingThumbnails = new Map<string, Set<HTMLImageElement>>();

// 已知存在于磁盘上的缩略图缓存文件路径集合（模块级内存索引）。
// adapter.exists 是异步的，而 markdown 代码块处理器是同步回调——为了在缩略图已缓存时
// 仍能同步拿到它的 resource 路径（避免先用原图撑一帧、再闪切成缩略图的闪屏），
// 启动时扫描缓存目录建一次索引（见 seedThumbnailCacheIndex），之后在生成/删除缓存时增量维护。
const knownThumbnailFiles = new Set<string>();

/** 同步判断某个缩略图缓存文件是否已经存在于磁盘上（供渲染处理器在同步回调里使用）。 */
export function isThumbnailCached(thumbPath: string): boolean {
    return knownThumbnailFiles.has(thumbPath);
}

/** 缩略图缓存文件的 resource 路径（app:// 形式），直接用 adapter 计算、不依赖 Vault 索引。 */
export function getThumbnailResourcePath(plugin: ImgRowPlugin, thumbPath: string): string {
    return plugin.app.vault.adapter.getResourcePath(thumbPath);
}

/**
 * 启动时扫描一次缓存目录，把已存在的缓存文件路径填入 knownThumbnailFiles 索引，
 * 使渲染处理器在同步回调里就能命中缓存、无需闪回原图。
 */
export async function seedThumbnailCacheIndex(plugin: ImgRowPlugin): Promise<void> {
    const cacheDir = normalizePath(runtimeDefaults.thumbnailPath);
    try {
        if (!(await plugin.app.vault.adapter.exists(cacheDir))) return;
        const { files } = await plugin.app.vault.adapter.list(cacheDir);
        for (const filePath of files) knownThumbnailFiles.add(filePath);
    } catch (error: unknown) {
        console.error("Failed to index thumbnail cache", error);
    }
}

/** 递归确保某个目录存在（DataAdapter.mkdir 的父目录创建行为不保证跨版本一致，这里显式逐级创建）。 */
async function ensureDir(adapter: DataAdapter, dir: string): Promise<void> {
    if (!dir) return;
    if (await adapter.exists(dir)) return;
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    if (parent && parent !== dir) await ensureDir(adapter, parent);
    await adapter.mkdir(dir);
}

/** 缩略图产出模式：grid 沿用现状的居中裁剪成正方形，masonry 保留长宽比等比缩放、不裁剪。 */
export type ThumbnailMode = "grid" | "masonry";

const THUMBNAIL_MODES: readonly ThumbnailMode[] = ["grid", "masonry"];

/**
 * 缩略图实际生成的边长（正方形）：以 THUMBNAIL_SIZE（覆盖最大的 LARGE 展示尺寸）为基准，
 * 乘以当前屏幕的 devicePixelRatio（封顶 2x，避免 3x 高密度屏把缓存文件撑得过大）。
 * 三档展示尺寸 S/M/L 共用同一份缓存文件，只在 CSS 里缩小显示，因此只要这一份按最大
 * 尺寸 × DPR 生成，S/M/L 在 Retina 屏下都能保持清晰。
 */
function getThumbnailTargetSide(): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.max(50, Math.round(config.THUMBNAIL_SIZE * dpr));
}

/**
 * 缩略图缓存路径：runtimeDefaults.thumbnailPath（用户可在设置里自定义） + md5(file.path + 目标分辨率[ + 模式])。
 * 把分辨率一起写入哈希输入，这样当 devicePixelRatio 变化（例如换到 Retina 屏）导致
 * 目标分辨率变化时，会自动指向一个新的缓存文件而不是复用旧的低清晰度缩略图。
 *
 * mode 默认 "grid"，且哈希输入刻意不带任何后缀——与引入瀑布流之前完全一致，
 * 保证已有用户的网格模式缓存不会因为这次改动而全部失效重新生成。masonry 模式的
 * 产出（保留长宽比、不裁剪）与 grid 完全不同，必须落在不同的缓存文件，因此额外
 * 加一个 "@masonry" 后缀，与 grid 的路径彻底分开、互不覆盖。
 */
export function getThumbPath(filePath: string, mode: ThumbnailMode = "grid"): string {
  const targetSide = getThumbnailTargetSide();
  const hashInput = mode === "masonry" ? `${filePath}@${targetSide}@masonry` : `${filePath}@${targetSide}`;
  return normalizePath(`${runtimeDefaults.thumbnailPath}${md5(hashInput)}`);
}

/**
 * 加载一张图片用于取帧，返回已加载完成的 HTMLImageElement。
 */
function loadImageFrame(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  // 必须在设置 src 之前声明以 CORS 模式加载：不加这个，部分 Electron/Chromium
  // 版本会把这次加载判定为「无凭证的跨域资源」，canvas.drawImage 之后整张画布
  // 被标记为 tainted，后续 toBlob/getImageData 一律抛 SecurityError——
  // 即使资源其实来自 Obsidian 自己的 app:// 协议、本该视为同源。
  image.crossOrigin = "anonymous";
  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = (e) => {
      if (e instanceof ErrorEvent && e.error instanceof Error) {
        reject(e.error);
      } else {
        reject(new Error(`Failed to load image: ${src}`));
      }
    };
  });
  image.src = src;
  return loadPromise;
}

/** 等待视频加载的超时时间：本地 vault 文件正常几百毫秒内就能触发 loadeddata，
 * 超过这个时长基本可以判定加载卡死（例如编解码器不受支持），不应无限挂起。 */
const VIDEO_FRAME_TIMEOUT_MS = 8000;

/**
 * 让指定的 <video> 元素加载 src 并定位到可用于截取封面帧的时间点，resolve 后
 * 该元素的当前帧即为目标封面帧，调用方可直接用 canvas 取帧。
 *
 * 视频刚加载完 metadata 时的"当前帧"通常是纯黑（尚未解码出真实画面），
 * 直接在 currentTime=0 时取帧大概率得到一张黑图。这里先等 loadeddata
 * （首帧已解码），再显式 seek 到一个很小的时间点（优先 0.1s，视频本身更短则退到时长一半），
 * 并等待 seeked 事件后才 resolve。
 *
 * 调用方必须把 video 元素挂进文档（哪怕挪到屏幕外）后再调用本函数——部分
 * Electron/Chromium 版本里，从未挂进文档树的 <video> 元素，其资源加载/解码时机
 * 不受保证，loadeddata 可能迟迟不触发，导致取帧 Promise 永远挂起（表现为缩略图
 * 一直不生成、<img> 停留在无法渲染的原视频路径上）。这里额外加一个超时兜底，
 * 避免即便挂进文档后仍卡死时，调用方的 await 无限等下去。
 */
function waitForVideoFrame(video: HTMLVideoElement, src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timed out loading video frame: ${src}`));
    }, VIDEO_FRAME_TIMEOUT_MS);

    video.onloadeddata = () => {
      const seekTo = Math.min(0.1, (video.duration || 0) / 2);
      if (!(seekTo > 0)) {
        window.clearTimeout(timer);
        resolve();
        return;
      }
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.currentTime = seekTo;
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Failed to load video: ${src}`));
    };
    // 同 loadImageFrame：取帧用的 canvas 后续要 toBlob 导出，必须在设置 src 之前
    // 声明 CORS 模式加载，否则同样会在 drawImage 之后把 canvas 标记为 tainted。
    video.crossOrigin = "anonymous";
    video.src = src;
  });
}

type ThumbnailFrameSource = HTMLImageElement | HTMLVideoElement;

function getFrameSize(media: ThumbnailFrameSource): { width: number; height: number } {
  return media.instanceOf(HTMLVideoElement)
    ? { width: media.videoWidth, height: media.videoHeight }
    : { width: media.width, height: media.height };
}

/**
 * 如果指定路径下还不存在缩略图，则：
 * 1. 读取原图/视频封面帧（通过 vault.getResourcePath）
 * 2. 使用 canvas 根据指定尺寸生成缩略图
 * 3. 通过 adapter 直接写入缓存目录（绕开 Vault 索引）
 * 4. 生成完成后，刷新所有等待这次生成的 img 元素的 src
 */
export async function ensureThumbnailForFile(plugin: ImgRowPlugin, file: TFile, thumbPath: string, imgEl: HTMLImageElement, mode: ThumbnailMode = "grid"): Promise<void> {
  // 同一缩略图已经有生成任务在进行：把这个 img 元素也加入等待列表，然后直接返回，
  // 不重复触发生成，也不会遗漏这次调用的 img 更新。
  const pending = generatingThumbnails.get(thumbPath);
  if (pending) {
    pending.add(imgEl);
    return;
  }
  const waiters = new Set<HTMLImageElement>([imgEl]);
  generatingThumbnails.set(thumbPath, waiters);

  const updateAll = (src: string) => {
    for (const el of waiters) el.src = src;
  };

  // 仅视频路径使用：取帧用的临时 <video> 元素，挂进 document 后才能保证加载触发
  // （见 waitForVideoFrame 注释），函数结束前（无论成功/失败）必须在 finally 里移除。
  let videoEl: HTMLVideoElement | null = null;

  const adapter = plugin.app.vault.adapter;

  try {
    // 再次检查，避免并发情况下重复生成；命中缓存则直接换用缩略图，并把路径记入内存索引。
    if (await adapter.exists(thumbPath)) {
      knownThumbnailFiles.add(thumbPath);
      updateAll(adapter.getResourcePath(thumbPath));
      return;
    }

    // 兼容更早版本：分辨率信息加入缓存 key 之前，缓存路径是 md5(file.path)（不带分辨率后缀）。
    // 引入分辨率后缀后，那批旧缓存不会再被任何路径引用，会变成永久孤儿。趁着这次要
    // 重新生成缩略图，顺手把旧缓存清掉，避免缓存目录无限堆积。
    const legacyThumbPath = normalizePath(`${runtimeDefaults.thumbnailPath}${md5(file.path)}`);
    if (legacyThumbPath !== thumbPath && (await adapter.exists(legacyThumbPath))) {
      try {
        await adapter.remove(legacyThumbPath);
        knownThumbnailFiles.delete(legacyThumbPath);
      } catch (error: unknown) {
        console.error("Failed to clean up legacy thumbnail cache", file.path, error);
      }
    }

    const originalSrc = plugin.app.vault.getResourcePath(file);
    const isVideo = isVideoExtension(file.extension);

    let loadedMedia: ThumbnailFrameSource;
    if (isVideo) {
        videoEl = createEl("video");
        videoEl.classList.add("plugin-video-thumbnail-source");
        videoEl.muted = true;
        videoEl.preload = "auto";
        activeDocument.body.appendChild(videoEl);
        await waitForVideoFrame(videoEl, originalSrc);
        loadedMedia = videoEl;
    } else {
        loadedMedia = await loadImageFrame(originalSrc);
    }

    // grid 模式：目标缩略图为正方形，以较短边为边长进行居中裁剪，然后缩放到 targetSide。
    // masonry 模式：不裁剪，只按长边基准（targetSide 对应列宽）等比缩放，保留原始长宽比。
    const targetSide = getThumbnailTargetSide();
    const { width, height } = getFrameSize(loadedMedia);
    if (!width || !height) return;

    // 部分设计稿/截图自带纯色留白（例如四周是黑色画布），直接按整图短边裁剪
    // 会把留白也一起保留在裁剪未触及的那条边上。这里先尝试去除留白，
    // 再基于实际内容区域生成缩略图，避免缩略图里出现大片纯色边。
    // 这是一种启发式检测，理论上可能误裁到内容本身贴近纯色背景的图片，
    // 因此提供开关，关闭后完全回退到整图（不裁边）。
    // 视频封面帧不参与这项检测（detectContentRect 只接受 HTMLImageElement，
    // 且视频画面出现大片纯色留白的情况本就少见），直接使用整帧。
    const content = !isVideo && plugin.settings.enableThumbnailBorderTrim
        ? detectContentRect(loadedMedia as HTMLImageElement)
        : { sx: 0, sy: 0, sw: width, sh: height };

    let sx: number, sy: number, sw: number, sh: number, canvasW: number, canvasH: number;
    if (mode === "masonry") {
        sx = content.sx;
        sy = content.sy;
        sw = content.sw;
        sh = content.sh;
        canvasW = targetSide;
        canvasH = Math.max(1, Math.round((targetSide * sh) / sw));
    } else {
        const cropSize = Math.min(content.sw, content.sh);
        sx = content.sx + (content.sw - cropSize) / 2;
        sy = content.sy + (content.sh - cropSize) / 2;
        sw = cropSize;
        sh = cropSize;
        canvasW = targetSide;
        canvasH = targetSide;
    }

    const canvas = createEl("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(loadedMedia, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

    // 缩略图统一生成为 JPG 格式
    const mimeType = "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, config.THUMBNAIL_QUALITY),
    );
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();

    // 确保缓存目录存在，然后直接通过 adapter 写入二进制文件（绕开 Vault 索引，
    // 因此点开头的目录也能写；同名文件直接覆盖）。
    const parts = thumbPath.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      if (dir) {
        await ensureDir(adapter, dir);
      }
    }
    await adapter.writeBinary(thumbPath, arrayBuffer);

    // 写入完成后，刷新所有等待这次生成的 img 元素的 src，并把路径记入内存索引。
    knownThumbnailFiles.add(thumbPath);
    updateAll(adapter.getResourcePath(thumbPath));
  } catch (error: unknown) {
    console.error("Failed to generate thumbnail for", file.path, error);
  } finally {
    generatingThumbnails.delete(thumbPath);
    videoEl?.remove();
  }
}

/**
 * 让缓存缩略图跟随原图的生命周期一起变化。
 *
 * 缩略图以 getThumbPath(file.path) 命名，天然和原图路径绑定。用户通过本插件自带的「删除」按钮
 * 删除图片时，image-actions.ts 会显式先删缓存再删原图；但如果用户是通过 Obsidian 原生
 * 方式（文件管理器重命名/移动/删除）操作原图，这两个动作都不会经过插件的删除逻辑——
 * 重命名后旧路径算出的缓存文件不再被任何原图对应，永久变成孤儿，且无从复用（新路径会
 * 生成新的缓存）；直接删除原图后同理，旧缓存不会被清理。
 * 这里监听 vault 的 rename/delete 事件，让缓存跟着原图删除。
 */
export function registerThumbnailCacheLifecycle(plugin: ImgRowPlugin): void {
  const adapter = plugin.app.vault.adapter;
  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      // 缓存目录自身文件的 rename/delete 不需要（也不应该）触发这里的逻辑。
      if (!(file instanceof TFile) || file.path.startsWith(runtimeDefaults.thumbnailPath) || oldPath.startsWith(runtimeDefaults.thumbnailPath)) {
        return;
      }
      void (async () => {
        // 原图重命名后，旧路径算出的缓存文件名不再对应该原图，新路径会算出新的文件名。
        // 缓存文件名是 md5(原图路径)，单向不可逆，无法从旧缓存反推出新缓存去"改名"；
        // 直接删掉旧缓存（两种模式各自独立），下次渲染按新路径重新生成即可——代价只是一次
        // 重新生成，比"复制再改名"简单可靠得多。
        for (const mode of THUMBNAIL_MODES) {
          const oldThumbPath = getThumbPath(oldPath, mode);
          try {
            if (await adapter.exists(oldThumbPath)) {
              await adapter.remove(oldThumbPath);
              knownThumbnailFiles.delete(oldThumbPath);
            }
          } catch (error: unknown) {
            console.error("Failed to remove thumbnail cache after rename", oldPath, "->", file.path, mode, error);
          }
        }
      })();
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on("delete", (file) => {
      if (!(file instanceof TFile) || file.path.startsWith(runtimeDefaults.thumbnailPath)) return;
      void (async () => {
        for (const mode of THUMBNAIL_MODES) {
          const thumbPath = getThumbPath(file.path, mode);
          // 通过插件自带删除按钮删除时，缓存已经被 image-actions.ts 提前删掉，这里查不到，直接跳过。
          try {
            if (await adapter.exists(thumbPath)) {
              await adapter.remove(thumbPath);
              knownThumbnailFiles.delete(thumbPath);
            }
          } catch (error: unknown) {
            console.error("Failed to clean up thumbnail cache after delete", file.path, mode, error);
          }
        }
      })();
    }),
  );
}

/**
 * 手动扫描 runtimeDefaults.thumbnailPath 下的全部缓存文件，删除其中不再对应任何当前 vault 内原图的文件。
 *
 * 背景：registerThumbnailCacheLifecycle 只能覆盖"插件运行期间、经由 Obsidian 的
 * rename/delete 事件触发"的原图变更。如果原图是在插件被禁用期间、或通过 vault 外部工具
 * 被移动/删除的，对应缓存不会经过那两个监听器，只会在缓存目录里永久沉积。
 *
 * 这里做一次扫描：对 vault 中每个图片文件，按当前目标分辨率重新计算一遍
 * "如果现在渲染它，期望的缓存路径是什么"，得到一份当前仍然有效的缓存路径集合；
 * 不在这份集合里的缓存文件都视为孤儿——既包括原图已经不存在的，也包括原图还在、
 * 但缓存是在其他分辨率（例如非 Retina 屏）下生成的旧文件，两者删除都是安全的：
 * 下次渲染到对应图片时会按当前分辨率重新生成一份。
 *
 * 关于遍历范围：缓存文件名是 md5(原图路径@分辨率)，单向不可逆，没法从缓存文件反推
 * 原图路径去逐个校验存在性，因此只能反过来枚举原图、算出全部合法缓存名。枚举时用
 * IMAGE_EXTENSIONS / VIDEO_EXTENSIONS 过滤，只取图片与视频文件的路径——笔记和其他附件
 * 永远不会有缩略图，也就不需要读它们的路径。万一漏掉某种插件支持、这里未列出的格式，
 * 后果只是它的缓存被当成孤儿删掉、下次渲染时重新生成，不会丢数据。
 *
 * @returns 实际删除的孤儿缓存文件数
 */
export async function pruneOrphanedThumbnailCache(plugin: ImgRowPlugin): Promise<number> {
  const adapter = plugin.app.vault.adapter;
  const cacheDir = normalizePath(runtimeDefaults.thumbnailPath);
  if (!(await adapter.exists(cacheDir))) return 0;

  const validThumbPaths = new Set<string>();
  for (const file of plugin.app.vault.getFiles()) {
    const ext = file.extension.toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) continue;
    if (file.path.startsWith(runtimeDefaults.thumbnailPath)) continue;
    // 两种模式的缓存路径都算作有效，即便笔记里当前只用到其中一种——
    // 不扫描 markdown 反推"实际用了哪种模式"，宁可保守保留，也不误删另一模式仍然有效的缓存。
    for (const mode of THUMBNAIL_MODES) {
      validThumbPaths.add(getThumbPath(file.path, mode));
    }
  }

  let removed = 0;
  const { files } = await adapter.list(cacheDir);
  for (const childPath of files) {
    if (validThumbPaths.has(childPath)) continue;
    try {
      await adapter.remove(childPath);
      knownThumbnailFiles.delete(childPath);
      removed++;
    } catch (error: unknown) {
      console.error("Failed to prune orphaned thumbnail cache", childPath, error);
    }
  }
  return removed;
}

/** 递归统计缓存目录（含子目录）占用的磁盘字节数。 */
async function sizeOfCacheDir(adapter: DataAdapter, dir: string): Promise<number> {
  const { files, folders } = await adapter.list(dir);
  let total = 0;
  for (const filePath of files) {
    total += (await adapter.stat(filePath))?.size ?? 0;
  }
  for (const folder of folders) {
    total += await sizeOfCacheDir(adapter, folder);
  }
  return total;
}

/** 计算当前缩略图缓存占用的磁盘空间（字节），供设置页展示。 */
export async function computeThumbnailCacheSize(plugin: ImgRowPlugin): Promise<number> {
  const adapter = plugin.app.vault.adapter;
  const cacheDir = normalizePath(runtimeDefaults.thumbnailPath);
  if (!(await adapter.exists(cacheDir))) return 0;
  return sizeOfCacheDir(adapter, cacheDir);
}

/** 清空整个缩略图缓存目录（递归删除），并同步清空内存索引。 */
export async function clearThumbnailCache(plugin: ImgRowPlugin): Promise<void> {
  const adapter = plugin.app.vault.adapter;
  const cacheDir = normalizePath(runtimeDefaults.thumbnailPath);
  if (await adapter.exists(cacheDir)) {
    await adapter.rmdir(cacheDir, true);
  }
  knownThumbnailFiles.clear();
}

/**
 * 把老版本（<=1.4.11）默认放在 assets/cache/ 的缩略图缓存迁移到新的插件目录位置。
 *
 * 只处理"仍在使用旧默认目录"的用户：缓存文件名是 md5(原图路径@分辨率)，与目录无关，
 * 因此迁移即"把旧目录下的文件原样搬到新目录"。用户自定义过缓存路径的一律不动（那
 * 是他们的显式选择，adapter 对 vault 内任意路径都能读写，自定义路径仍然有效）。
 * 旧版本里"清空路径 = 使用默认"，因此空字符串也按旧默认处理。
 */
export async function migrateLegacyThumbnailCache(plugin: ImgRowPlugin): Promise<void> {
  const adapter = plugin.app.vault.adapter;

  const storedPath = (plugin.settings.cachePath ?? "").trim();
  const usesLegacyDefault = storedPath === ""
    || normalizeCacheFolderPath(storedPath) === normalizeCacheFolderPath(config.LEGACY_THUMBNAIL_PATH);
  if (!usesLegacyDefault) return;

  const legacyDir = normalizePath(config.LEGACY_THUMBNAIL_PATH);
  const newDir = normalizePath(config.DEFAULT_THUMBNAIL_PATH);

  if (await adapter.exists(legacyDir)) {
    if (newDir !== legacyDir) {
      await ensureDir(adapter, newDir);

      const { files } = await adapter.list(legacyDir);
      for (const filePath of files) {
        const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
        if (!fileName) continue;
        const targetPath = normalizePath(`${newDir}/${fileName}`);
        try {
          await adapter.writeBinary(targetPath, await adapter.readBinary(filePath));
        } catch (error: unknown) {
          console.error("Failed to migrate thumbnail cache file", filePath, error);
        }
      }

      // 迁移完成（或部分完成）后删除旧目录，避免空壳残留；即使个别文件迁移失败，
      // 它们也只是可再生的缓存，丢弃无害。
      try {
        await adapter.rmdir(legacyDir, true);
      } catch (error: unknown) {
        console.error("Failed to remove legacy thumbnail cache directory", legacyDir, error);
      }
    }
  }

  // 无论有没有旧缓存，都把设置切换到新默认，避免后续缩略图继续写到旧位置。
  plugin.settings.cachePath = config.DEFAULT_THUMBNAIL_PATH;
  runtimeDefaults.thumbnailPath = config.DEFAULT_THUMBNAIL_PATH;
  await plugin.saveSettings();
}

/** 注册命令面板命令，供用户手动触发 pruneOrphanedThumbnailCache 并看到结果反馈。 */
export function registerPruneOrphanedThumbnailsCommand(plugin: ImgRowPlugin): void {
  plugin.addCommand({
    id: "prune-orphaned-thumbnail-cache",
    name: t.thumbnail.pruneCommandName,
    callback: () => {
      void (async () => {
        const removed = await pruneOrphanedThumbnailCache(plugin);
        new Notice(
          removed > 0
            ? t.thumbnail.pruneRemoved(removed)
            : t.thumbnail.pruneNone,
        );
      })();
    },
  });
}
