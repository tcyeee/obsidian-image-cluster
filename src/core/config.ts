/**
 * 真正不变的常量：尺寸预设、缩略图/预览/面板等调优参数。
 * 整个插件生命周期内不会被任何代码重新赋值——需要"当前生效的用户默认值"，
 * 请使用下面的 runtimeDefaults，不要往这个对象里加会被运行时改写的字段。
 */
export const config = {
    /* 从未成组的独立图片行 -> imgs 代码块时，跟随原列表缩进的像素值 */
    LIST_INDENT_PX: 28,          // Obsidian ul>li margin-inline-start:3ch ≈ 28px

    /* THUMBNAIL */
    // 缩略图缓存目录的默认值，也是用户在设置里把路径清空/重置时回退到的值。
    // 注意：Obsidian 对以 "." 开头的目录（例如 ".cache"）不会作为 Vault 内容进行索引，
    // 因此缩略图目录必须使用非点开头的路径，才能通过 vault.getAbstractFileByPath 正常访问
    // ——normalizeCacheFolderPath/isDotPrefixedCachePath 就是用来在运行时校验这一点的。
    DEFAULT_THUMBNAIL_PATH: "assets/cache/",
    THUMBNAIL_QUALITY: 0.8, // 缩略图质量
    THUMBNAIL_SIZE: 220,    // 缩略图基准尺寸（1x），需 >= LARGE_SIZE 才能保证三档展示尺寸都清晰；实际生成分辨率会再乘以 devicePixelRatio（见 thumbnail.ts）
    MAX_VISIBLE_ROWS: 3,    // 最多显示 3 行

    /* LIMIT */
    LIMIT_DELAY: 500,    // 限制延迟时间
    LIMIT_MAX_RETRY: 5,  // 限制最大重试次数

    /* PREVIEW */
    PREVIEW_MIN_SCALE: 1.0, // 预览最小缩放比例
    PREVIEW_MAX_SCALE: 2.5, // 预览最大缩放比例

    /* PANEL */
    PANEL_CLOSE_DELAY: 500, // 设置面板失去焦点后延迟关闭时间（ms）

    /* SMALL */
    SMALL_SIZE: 90,
    SMALL_GAP: 5,
    SMALL_RADIUS: 8,

    /* MEDIUM */
    MEDIUM_SIZE: 150,
    MEDIUM_GAP: 8,
    MEDIUM_RADIUS: 10,

    /* LARGE */
    LARGE_SIZE: 220,
    LARGE_GAP: 10,
    LARGE_RADIUS: 14,

    /* 以下三项目前没有对应的插件设置项，永远保持默认值，属于真正的常量 */
    DEFAULT_HIDDEN: false,       // 默认是否隐藏图片
    DEFAULT_LIMIT: false,        // 默认是否限制显示行数
    DEFAULT_PADDING_LEFT: 0,     // 默认左侧内移像素（0 表示不右移；单位 px）
};

/**
 * Obsidian 会当作图片嵌入渲染的扩展名（小写）。
 *
 * 本插件只对图片生成缩略图，因此需要"vault 里有哪些图片"这一信息的地方
 * （目前只有 pruneOrphanedThumbnailCache）都用它把范围收到最小：
 * 只看图片文件，绝不读取笔记、附件等其他文件的路径。
 */
export const IMAGE_EXTENSIONS = new Set([
    "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp",
]);

/**
 * 新建图片组在代码块没有显式配置行时使用的默认外观。
 *
 * 与上面 config 中的调优常量不同：这几个字段代表「当前生效的用户默认值」，
 * 会在插件加载、以及用户在设置页修改「默认尺寸/边框/阴影」时被
 * applySettingsToConfig（settings.ts）整体重写。拆成单独的对象是为了让
 * 「这个字段会不会被运行时改写」一目了然，不必在 config 里对每个字段
 * 逐一判断它到底是常量还是运行时状态。
 */
export const runtimeDefaults = {
    size: config.MEDIUM_SIZE,
    gap: config.MEDIUM_GAP,
    radius: config.MEDIUM_RADIUS,
    shadow: false,
    border: false,
    thumbnailPath: config.DEFAULT_THUMBNAIL_PATH,
};

/**
 * 判断一个已归一化的路径里是否存在以 "." 开头的路径段（如 ".cache"、"foo/.bar"）。
 * Obsidian 不会索引这类目录，一旦用户把缓存目录配置成这种路径，缩略图会被写入磁盘但
 * vault.getAbstractFileByPath 永远查不到，导致每次都当成"不存在"重新生成，旧文件永久残留。
 * 因此在写入 runtimeDefaults.thumbnailPath 之前必须挡掉这类输入。
 */
export function isDotPrefixedCachePath(normalizedPath: string): boolean {
    return normalizedPath.split("/").some(segment => segment.startsWith("."));
}

/**
 * 把用户在设置里填写的缓存目录路径，归一化成以单个 "/" 结尾的形式。
 *
 * 这里只做与平台无关的字符串层面清理（反斜杠转正斜杠、折叠重复斜杠、去掉首尾斜杠）；
 * 不依赖 obsidian 包的 normalizePath —— config.ts 会被单元测试直接 import（不经过打包），
 * 而 "obsidian" 在测试环境里是没有真实运行时导出的纯类型声明包，引入会导致测试直接报错。
 * 完整的、真正落到磁盘路径上的归一化交给 getThumbPath（thumbnail.ts）里那次
 * obsidian 的 normalizePath 调用去做最终兜底。
 */
export function normalizeCacheFolderPath(rawPath: string): string {
    const source = (rawPath.trim() || config.DEFAULT_THUMBNAIL_PATH).replace(/\\/g, "/");
    const collapsed = source.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
    return `${collapsed || config.DEFAULT_THUMBNAIL_PATH.replace(/\/$/, "")}/`;
}
