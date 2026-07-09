export interface ContentRect {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}

// 分析用画布的最大边长：只用来判断裁边范围，不影响最终缩略图清晰度，
// 越小越快，200 足够稳定识别整行/整列的纯色边框。
const ANALYSIS_MAX_SIDE = 200;
// 像素与背景色的最大允许偏差（每个通道），用于判断像素是否属于边框
const COLOR_TOLERANCE = 24;
// 一行/一列中有多大比例的像素落在容差内，才判定为"纯色边框行/列"
const ROW_MATCH_RATIO = 0.97;
// 单边最多裁掉的比例，避免误判把主体内容也裁掉
const MAX_TRIM_RATIO = 0.4;
// 裁剩内容占比下限，低于此比例视为误判，放弃裁边
const MIN_KEEP_RATIO = 0.3;
// 在检测到的边框基础上再额外内收的像素数（分析画布坐标系），用于吃掉圆角/阴影造成的过渡像素
const ERODE_PX = 2;

/**
 * 检测图片四周是否存在大面积纯色边框（例如设计稿导出图常见的黑色/白色留白），
 * 若存在则返回去除边框后的内容区域（原图坐标系），否则返回整张图的范围。
 *
 * 用于缩略图生成前的预裁剪：避免"图片本身自带留白"导致居中裁剪成正方形后
 * 仍然带着大片纯色边（尤其是较长的那条边未被裁切时，留白会被完整保留）。
 */
export function detectContentRect(img: HTMLImageElement): ContentRect {
    const { width, height } = img;
    const full: ContentRect = { sx: 0, sy: 0, sw: width, sh: height };
    if (!width || !height) return full;

    const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(width, height));
    const aw = Math.max(1, Math.round(width * scale));
    const ah = Math.max(1, Math.round(height * scale));

    const canvas = createEl("canvas");
    canvas.width = aw;
    canvas.height = ah;
    const ctx = canvas.getContext("2d");
    if (!ctx) return full;
    ctx.drawImage(img, 0, 0, aw, ah);

    let data: Uint8ClampedArray;
    try {
        data = ctx.getImageData(0, 0, aw, ah).data;
    } catch {
        // 跨域等情况下 getImageData 可能抛错，放弃裁边优化，回退到整图
        return full;
    }

    // 同时读取 alpha：透明 PNG 的边框在 RGB 上通常也会读成接近黑色（未预乘的透明像素），
    // 如果只比较 RGB，真正不透明的深色内容会被误判成"和透明边框一样的背景色"而被裁掉。
    // 加入 alpha 比较后，只有本身也接近透明的像素才会被当成边框。
    const at = (x: number, y: number): [number, number, number, number] => {
        const i = (y * aw + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    const closeToBg = (p: readonly [number, number, number, number], bg: readonly [number, number, number, number]) =>
        Math.abs(p[0] - bg[0]) < COLOR_TOLERANCE &&
        Math.abs(p[1] - bg[1]) < COLOR_TOLERANCE &&
        Math.abs(p[2] - bg[2]) < COLOR_TOLERANCE &&
        Math.abs(p[3] - bg[3]) < COLOR_TOLERANCE;

    // 用四角像素的平均值作为背景色候选；四角本身颜色差异太大，说明四周就是内容，不裁边
    const corners = [at(0, 0), at(aw - 1, 0), at(0, ah - 1), at(aw - 1, ah - 1)];
    const bg: [number, number, number, number] = [0, 1, 2, 3].map(
        (c) => corners.reduce((sum, p) => sum + p[c], 0) / 4,
    ) as [number, number, number, number];
    if (!corners.every((p) => closeToBg(p, bg))) return full;

    const isBackgroundRow = (y: number) => {
        let matched = 0;
        for (let x = 0; x < aw; x++) if (closeToBg(at(x, y), bg)) matched++;
        return matched / aw >= ROW_MATCH_RATIO;
    };
    const isBackgroundCol = (x: number) => {
        let matched = 0;
        for (let y = 0; y < ah; y++) if (closeToBg(at(x, y), bg)) matched++;
        return matched / ah >= ROW_MATCH_RATIO;
    };

    let top = 0;
    let bottom = ah - 1;
    let left = 0;
    let right = aw - 1;
    const maxVerticalTrim = Math.floor(ah * MAX_TRIM_RATIO);
    const maxHorizontalTrim = Math.floor(aw * MAX_TRIM_RATIO);

    while (top < maxVerticalTrim && top < bottom && isBackgroundRow(top)) top++;
    while (ah - 1 - bottom < maxVerticalTrim && bottom > top && isBackgroundRow(bottom)) bottom--;
    while (left < maxHorizontalTrim && left < right && isBackgroundCol(left)) left++;
    while (aw - 1 - right < maxHorizontalTrim && right > left && isBackgroundCol(right)) right--;

    if (top === 0 && bottom === ah - 1 && left === 0 && right === aw - 1) return full;

    // 圆角/阴影会让边框与内容之间多出一两行"半黑半白"的过渡像素，逐行匹配率
    // 达不到 ROW_MATCH_RATIO 而被保留下来，导致裁剪后仍残留一道细边。
    // 只对确实检测到边框的那一侧额外多收进 ERODE_PX，吃掉这圈过渡像素。
    if (top > 0) top = Math.min(top + ERODE_PX, bottom - 1);
    if (bottom < ah - 1) bottom = Math.max(bottom - ERODE_PX, top + 1);
    if (left > 0) left = Math.min(left + ERODE_PX, right - 1);
    if (right < aw - 1) right = Math.max(right - ERODE_PX, left + 1);

    const trimmedW = right - left + 1;
    const trimmedH = bottom - top + 1;
    if (trimmedW < aw * MIN_KEEP_RATIO || trimmedH < ah * MIN_KEEP_RATIO) return full;

    // 分析画布坐标 -> 原图坐标的换算会有独立的四舍五入误差；当某一轴的分析画布尺寸很小
    // （极端长宽比图片，例如很宽很矮的横幅）时，这个误差经 1/scale 放大后足以让换算出的
    // sx+sw / sy+sh 超出原图实际宽高。这里统一 clamp 到 [0, width]/[0, height]，
    // 保证调用方（thumbnail.ts 的 drawImage）拿到的永远是合法的源矩形。
    const sx = Math.max(0, Math.min(Math.round(left / scale), width));
    const sy = Math.max(0, Math.min(Math.round(top / scale), height));
    const sw = Math.max(1, Math.min(Math.round(trimmedW / scale), width - sx));
    const sh = Math.max(1, Math.min(Math.round(trimmedH / scale), height - sy));

    return { sx, sy, sw, sh };
}
