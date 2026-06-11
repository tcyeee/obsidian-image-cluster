export const config = {
    DEFAULT_SIZE: 150,     // 默认图片大小
    DEFAULT_GAP: 8,        // 默认图片间距
    DEFAULT_RADIUS: 10,    // 默认图片圆角
    DEFAULT_SHADOW: false, // 默认是否阴影
    DEFAULT_BORDER: false, // 默认是否边框
    DEFAULT_HIDDEN: false, // 默认是否隐藏图片
    DEFAULT_LIMIT: false,  // 默认是否限制显示行数

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

    /* THUMBNAIL */
    // 注意：Obsidian 对以 "." 开头的目录（例如 ".cache"）不会作为 Vault 内容进行索引，
    // 因此缩略图目录必须使用非点开头的路径，才能通过 vault.getAbstractFileByPath 正常访问。
    THUMBNAIL_PATH: "assets/cache/",
    THUMBNAIL_QUALITY: 0.8, // 缩略图质量
    THUMBNAIL_SIZE: 220,    // 缩略图尺寸
    MAX_VISIBLE_ROWS: 3,    // 最多显示 3 行

    /* LIMIT */
    LIMIT_DELAY: 500,    // 限制延迟时间
    LIMIT_MAX_RETRY: 5,  // 限制最大重试次数

    /* PREVIEW */
    PREVIEW_MIN_SCALE: 1.0, // 预览最小缩放比例
    PREVIEW_MAX_SCALE: 2.5, // 预览最大缩放比例
};