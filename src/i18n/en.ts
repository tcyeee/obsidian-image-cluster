export const en = {
    settings: {
        defaultSize: {
            name: "Default image size",
            desc: "Size applied to new image groups that have no explicit size setting.",
            small: "Small (90px)",
            medium: "Medium (150px)",
            large: "Large (220px)",
        },
        defaultBorder: {
            name: "Default border",
            desc: "Show a border around each image by default.",
        },
        defaultShadow: {
            name: "Default shadow",
            desc: "Show a drop shadow under each image by default.",
        },
        hoverGroupButton: {
            name: "Hover-to-group button",
            desc: "Show a button on hover over a standalone image (live preview) to convert it into an image group.",
        },
        dragToGroup: {
            name: "Drag images in/out of groups",
            desc: "Allow dragging a standalone image (live preview) into an existing image group, and dragging an image out of a group back into the editor.",
        },
        cachePath: {
            name: "Cache folder path",
            desc: "Vault-relative folder where generated thumbnail cache files are stored. Leave blank to reset to the default (\"assets/cache/\"). Must not contain a dot-prefixed segment (e.g. \".cache\"), since Obsidian doesn't index those folders. Changing this does not move existing cache files — they stay in the old folder (safe to delete manually) and are regenerated at the new location on next use. Edits only take effect once you click the checkmark to confirm.",
            invalidPath: "Cache folder path cannot contain a dot-prefixed segment (e.g. \".cache\") — change was not applied.",
            apply: "Apply",
            discard: "Discard",
        },
        thumbnailBorderTrim: {
            name: "Trim solid-color borders in thumbnails",
            desc: "When generating a thumbnail, try to detect and remove a solid-color border (such as black canvas padding in a design mockup) before cropping to a square, so it doesn't get baked into the thumbnail. Only affects newly generated thumbnails, not ones already cached.",
        },
    },
    contextMenu: {
        openInDefaultApp: "Open in default app",
        showInSystemExplorer: "Show in system explorer",
        copyImage: "Copy image",
        copyImageFailed: "Copy image failed",
        removeFromGroup: "Remove from group",
        deleteImage: "Delete image",
    },
    confirmDelete: {
        title: "Delete image",
        body: (count: number) =>
            `This image is referenced in ${count} other place${count > 1 ? "s" : ""} in your vault. Deleting the original file will break those references.`,
        cancel: "Cancel",
        removeFromGroupOnly: "Remove from group only",
        deleteAnyway: "Delete original anyway",
    },
    settingPanel: {
        layout: "Layout",
        grid: "Grid",
        masonry: "Masonry",
        canvasSize: "Canvas size",
        appearance: "Appearance",
        border: "border",
        shadow: "shadow",
        hidden: "hidden",
        limit: "limit",
        paddingLeft: "padding-left",
        pluginSettings: "Plugin settings",
        groupSettingsAriaLabel: "Image group settings",
    },
    imageActions: {
        removeFromGroupAriaLabel: "Remove from group",
        deleteImageAriaLabel: "Delete image",
        removeBrokenLinkAriaLabel: "Remove broken link",
    },
    common: {
        groupImages: "Group images",
    },
    thumbnail: {
        pruneCommandName: "Clean up orphaned thumbnail cache",
        pruneRemoved: (n: number) => `Removed ${n} orphaned thumbnail${n > 1 ? "s" : ""}.`,
        pruneNone: "No orphaned thumbnails found.",
    },
    persistence: {
        saveSettingsFailed: "Could not save image group settings — please try again",
        saveOrderFailed: "Could not save the new image order — please try again",
        removeImageFailed: "Could not remove the image — please try again",
        removeFromGroupFailed: "Could not remove the image from the group — please try again",
        moveIntoGroupFailed: "Could not move the image into the group — please try again",
        moveOutFailed: "Could not move the image out — the original group could not be found, please try again",
    },
};

export type Translations = typeof en;
