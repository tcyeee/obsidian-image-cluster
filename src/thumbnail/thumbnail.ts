import ImgRowPlugin from "main";
import { TFile } from "obsidian";
import { config } from "../core/config";

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
