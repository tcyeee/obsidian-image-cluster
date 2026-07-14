import ImgRowPlugin from "main";
import { TFile, normalizePath } from "obsidian";
import { config } from "../core/config";
import { detectContentRect } from "./content-rect";
import { md5 } from "./md5";

// 记录每个正在生成中的缩略图路径 -> 等待这次生成结果的所有 <img> 元素。
// 避免并发情况下对同一文件重复 createBinary 导致 "File already exists."，
// 同时保证「生成期间该代码块被重渲染、传入了一个新的 img 元素」时，
// 新元素也能在生成完成后收到 src 更新，而不是只有第一次调用时传入的（可能已被移除的）元素收到。
const generatingThumbnails = new Map<string, Set<HTMLImageElement>>();

/**
 * 如果指定路径下还不存在缩略图，则：
 * 1. 读取原图（通过 vault.getResourcePath）
 * 2. 使用 canvas 根据指定尺寸生成缩略图
 * 3. 写入 vault 的 cache 目录
 * 4. 生成完成后，刷新所有等待这次生成的 img 元素的 src
 */
export async function ensureThumbnailForFile(plugin: ImgRowPlugin, file: TFile, thumbPath: string, imgEl: HTMLImageElement): Promise<void> {
  // 同一缩略图已经有生成任务在进行：把这个 img 元素也加入等待列表，然后直接返回，
  // 不重复触发生成（避免并发 createBinary 报错），也不会遗漏这次调用的 img 更新。
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

  try {
    // 再次检查，避免并发情况下重复生成
    const existed = plugin.app.vault.getAbstractFileByPath(thumbPath);
    if (existed instanceof TFile) {
      updateAll(plugin.app.vault.getResourcePath(existed));
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

    // 部分设计稿/截图自带纯色留白（例如四周是黑色画布），直接按整图短边裁剪
    // 会把留白也一起保留在裁剪未触及的那条边上。这里先尝试去除留白，
    // 再基于实际内容区域做居中方形裁剪，避免缩略图里出现大片纯色边。
    // 这是一种启发式检测，理论上可能误裁到内容本身贴近纯色背景的图片，
    // 因此提供开关，关闭后完全回退到原来的整图居中裁剪。
    const content = plugin.settings.enableThumbnailBorderTrim
        ? detectContentRect(loadedImg)
        : { sx: 0, sy: 0, sw: width, sh: height };
    const cropSize = Math.min(content.sw, content.sh);
    const sx = content.sx + (content.sw - cropSize) / 2;
    const sy = content.sy + (content.sh - cropSize) / 2;

    const canvas = createEl("canvas");
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

    // 写入完成后，刷新所有等待这次生成的 img 元素的 src
    updateAll(plugin.app.vault.getResourcePath(newThumb));
  } catch (error: unknown) {
    // 如果只是并发场景下偶发的 "File already exists."，尝试直接复用已存在文件，并不视为真正错误
    if (error instanceof Error && error.message === "File already exists.") {
      const existedNow = plugin.app.vault.getAbstractFileByPath(thumbPath);
      if (existedNow instanceof TFile) {
        updateAll(plugin.app.vault.getResourcePath(existedNow));
        return;
      }
    }
    console.error("Failed to generate thumbnail for", file.path, error);
  } finally {
    generatingThumbnails.delete(thumbPath);
  }
}

/**
 * 让缓存缩略图跟随原图的生命周期一起变化。
 *
 * 缩略图以 md5(file.path) 命名，天然和原图路径绑定。用户通过本插件自带的「删除」按钮
 * 删除图片时，image-actions.ts 会显式先删缓存再删原图；但如果用户是通过 Obsidian 原生
 * 方式（文件管理器重命名/移动/删除）操作原图，这两个动作都不会经过插件的删除逻辑——
 * 重命名后旧路径算出的缓存文件不再被任何原图对应，永久变成孤儿，且无从复用（新路径会
 * 生成新的缓存），只会在 assets/cache/ 里越积越多；直接删除原图后同理，旧缓存不会被清理。
 * 这里监听 vault 的 rename/delete 事件，让缓存跟着原图重命名/删除。
 */
export function registerThumbnailCacheLifecycle(plugin: ImgRowPlugin): void {
  const thumbPathFor = (path: string) => normalizePath(`${config.THUMBNAIL_PATH}${md5(path)}`);

  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      // 缓存目录自身文件的 rename/delete 不需要（也不应该）触发这里的逻辑，
      // 否则会对一个本就是缓存文件的路径去找"它的缓存"，纯属无意义的空转。
      if (!(file instanceof TFile) || file.path.startsWith(config.THUMBNAIL_PATH) || oldPath.startsWith(config.THUMBNAIL_PATH)) {
        return;
      }
      void (async () => {
        const oldThumbPath = thumbPathFor(oldPath);
        const oldThumb = plugin.app.vault.getAbstractFileByPath(oldThumbPath);
        if (!(oldThumb instanceof TFile)) return; // 原本就没有缓存，无需迁移

        const newThumbPath = thumbPathFor(file.path);
        if (plugin.app.vault.getAbstractFileByPath(newThumbPath)) return; // 目标路径已有缓存，保留旧缓存原样，避免覆盖

        try {
          await plugin.app.vault.rename(oldThumb, newThumbPath);
        } catch (error) {
          console.error("Failed to migrate thumbnail cache after rename", oldPath, "->", file.path, error);
        }
      })();
    }),
  );

  plugin.registerEvent(
    plugin.app.vault.on("delete", (file) => {
      if (!(file instanceof TFile) || file.path.startsWith(config.THUMBNAIL_PATH)) return;
      void (async () => {
        const thumbPath = thumbPathFor(file.path);
        const thumb = plugin.app.vault.getAbstractFileByPath(thumbPath);
        // 通过插件自带删除按钮删除时，缓存已经被 image-actions.ts 提前删掉，这里查不到，直接跳过。
        if (!(thumb instanceof TFile)) return;
        try {
          await plugin.app.fileManager.trashFile(thumb);
        } catch (error) {
          console.error("Failed to clean up thumbnail cache after delete", file.path, error);
        }
      })();
    }),
  );
}
