import { SettingOptions } from "../core/domain";

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
