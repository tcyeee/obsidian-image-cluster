![](assets/banner.png)

<div align="center">
	<img src="https://img.shields.io/badge/📩-tcyeee@outlook.com-red">
	<!-- last commit -->
	<img src="https://img.shields.io/github/last-commit/tcyeee/obsidian-image-cluster">
	<!-- release -->
	<img src="https://img.shields.io/github/v/release/tcyeee/obsidian-image-cluster">
	<!-- license -->
	<img src="https://img.shields.io/github/license/tcyeee/obsidian-image-cluster">
	<!-- stars -->
	<img src="https://img.shields.io/github/stars/tcyeee/obsidian-image-cluster">
</div>

<br>

<div align="center"><a href="i18n/README.zh.md">中文</a> ｜ English</div>

# Image Cluster

Image Cluster helps you arrange multiple images into a clean, organized group in your Obsidian notes. The animation shows all available interactions.

![](assets/0.gif)
## Installation

### Install from Obsidian

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **Image Cluster**.
3. Select **Install**, then enable the plugin.

### Install manually

1. Open the [Image Cluster download page](https://community.obsidian.md/plugins/image-cluster).
2. Download the plugin and follow the installation instructions on the page.
3. Open **Settings → Community plugins** in Obsidian and enable **Image Cluster**.

## Advanced options

These options are saved automatically in the first line of an `imgs` block. You can also edit their values manually when you need more precise control.

| Option | What it changes | Initial value | Available values |
| --- | --- | --- | --- |
| `size` | Image width and height | `150` | `50`–`500` px |
| `gap` | Space between images | `8` | `0`–`50` px |
| `radius` | Image corner roundness | `10` | `0`–`50` px |
| `shadow` | Shows an image shadow | `false` | `true` or `false` |
| `border` | Shows an image border | `false` | `true` or `false` |
| `hidden` | Blurs the images and prevents them from being opened | `false` | `true` or `false` |
| `limit` | Shows no more than three rows until expanded | `false` | `true` or `false` |
| `padding-left` | Moves the image group to the right | `0` | Any number from `0` px |
