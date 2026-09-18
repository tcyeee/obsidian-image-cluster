import { Translations } from "./en";

export const zh: Translations = {
    settings: {
        defaultSize: {
            name: "默认图片尺寸",
            desc: "应用于未单独设置尺寸的新建图片组的默认尺寸。",
            small: "小 (90px)",
            medium: "中 (150px)",
            large: "大 (220px)",
        },
        defaultBorder: {
            name: "默认边框",
            desc: "默认在每张图片周围显示边框。",
        },
        defaultShadow: {
            name: "默认阴影",
            desc: "默认在每张图片下方显示投影。",
        },
        hoverGroupButton: {
            name: "悬浮成组按钮",
            desc: "在实时预览模式下悬停独立图片时显示一个按钮，点击可将其转换为图片组。",
        },
        dragToGroup: {
            name: "拖拽图片进出图片组",
            desc: "允许将独立图片（实时预览模式）拖入已有的图片组，也允许把图片组内的图片拖出到编辑器空白处。",
        },
        cachePath: {
            name: "缓存文件夹路径",
            desc: "生成的缩略图缓存文件所在的库内相对路径。留空则重置为默认值（\"assets/cache/\"）。不能包含以点开头的路径片段（如 \".cache\"），因为 Obsidian 不会索引这类文件夹。修改此项不会移动已有的缓存文件——它们会留在原文件夹中（可手动删除），并在下次使用时于新路径重新生成。修改仅在点击确认勾选按钮后生效。",
            invalidPath: "缓存文件夹路径不能包含以点开头的路径片段（如 \".cache\"）——本次修改未生效。",
            apply: "应用",
            discard: "放弃",
        },
        thumbnailBorderTrim: {
            name: "裁剪缩略图中的纯色边框",
            desc: "生成缩略图时，尝试检测并去除纯色边框（例如设计稿画布中的黑色留白），避免裁切成方形时把边框也保留进缩略图。仅影响新生成的缩略图，不影响已缓存的。",
        },
    },
    contextMenu: {
        openInDefaultApp: "用默认应用打开",
        showInSystemExplorer: "在系统文件管理器中显示",
        copyImage: "复制图片",
        copyImageFailed: "复制图片失败",
        removeFromGroup: "从组中移除",
        deleteImage: "删除图片",
    },
    confirmDelete: {
        title: "删除图片",
        body: (count: number) =>
            `该图片在库中的其他 ${count} 处被引用。删除原始文件将导致这些引用失效。`,
        cancel: "取消",
        removeFromGroupOnly: "仅从组中移除",
        deleteAnyway: "仍然删除原始文件",
    },
    settingPanel: {
        layout: "布局",
        grid: "网格",
        masonry: "瀑布流",
        canvasSize: "画布尺寸",
        appearance: "外观",
        border: "边框",
        shadow: "阴影",
        hidden: "隐藏",
        limit: "限制行数",
        paddingLeft: "左侧留白",
        pluginSettings: "插件设置",
        groupSettingsAriaLabel: "图片组设置",
    },
    imageActions: {
        removeFromGroupAriaLabel: "从组中移除",
        deleteImageAriaLabel: "删除图片",
        removeBrokenLinkAriaLabel: "移除失效链接",
    },
    common: {
        groupImages: "组合图片",
    },
    thumbnail: {
        pruneCommandName: "清理孤立的缩略图缓存",
        pruneRemoved: (n: number) => `已清理 ${n} 个孤立缩略图。`,
        pruneNone: "未发现孤立的缩略图。",
    },
    persistence: {
        saveSettingsFailed: "无法保存图片组设置，请重试",
        saveOrderFailed: "无法保存新的图片顺序，请重试",
        removeImageFailed: "无法删除图片，请重试",
        removeFromGroupFailed: "无法将图片从组中移除，请重试",
        moveIntoGroupFailed: "无法将图片移入组中，请重试",
        moveOutFailed: "无法将图片移出——找不到原始图片组，请重试",
    },
};
