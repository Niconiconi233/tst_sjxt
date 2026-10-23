/**
 * 导出文件的落盘方式
 *
 * 桌面端走系统「另存为」对话框，再交给 Rust 侧的自定义命令写盘 ——
 * 不用 fs 插件是因为它的 scope 只覆盖固定系统目录，另存到 U 盘、共享盘或其他
 * 分区时会被 `fs.write_file not allowed` 拦下。浏览器预览模式退化为常规下载。
 */
import { isTauriRuntime } from '@/services/backend';

export interface SaveFilter {
  name: string;
  extensions: string[];
}

/** 用 FileReader 转 base64，避免大字节数组在 IPC 里变成超长 JSON 数组 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取导出内容失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 保存二进制内容到用户选择的位置。
 * @returns 保存成功返回路径（浏览器返回文件名），用户取消返回 null
 */
export async function saveBlobAs(
  blob: Blob,
  defaultName: string,
  filters: SaveFilter[],
): Promise<string | null> {
  if (isTauriRuntime()) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core'),
    ]);
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    const dataBase64 = await blobToBase64(blob);
    return await invoke<string>('write_export_file', { path, dataBase64 });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 交给浏览器接管后再释放，避免 Safari 下载被打断
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return defaultName;
}

/** 把标题转成安全的文件名 */
export function safeFileName(title: string, fallback = '未命名文件'): string {
  const base = (title || fallback).replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return base || fallback;
}
