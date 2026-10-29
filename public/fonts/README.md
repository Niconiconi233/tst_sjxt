# 中文字体目录

本目录存放 docx-editor 编辑器使用的中文字体文件（`.ttf` / `.otf` 单字体文件）。

## 为什么需要

docx-editor 引擎默认不携带中文字体，不配置时中文会以 monospace 近似排版（换行、分页、字距不准）。把中文字体放到这里，`src/components/DocxEditor.tsx` 会通过 `customFonts()` 自动注册，保证文书（宋体/黑体/楷体/仿宋）的度量与分页正确、字形按真实字体绘制。

## 放置要求

把字体文件放到本目录，**文件名必须与下表完全一致**（区分大小写）：

| 文件名 | 对应字体 | 说明 |
|---|---|---|
| `Songti.ttf` | 宋体（SimSun） | 正文，常规字重，必需 |
| `Songti-Bold.ttf` | 宋体粗体 | 可选，缺则粗体退回常规 |
| `SimHei.ttf` | 黑体（SimHei） | 标题，常规字重 |
| `SimHei-Bold.ttf` | 黑体粗体 | 可选 |
| `KaiTi.ttf` | 楷体（KaiTi） | 可选 |
| `FangSong.ttf` | 仿宋（FangSong） | 可选 |

> 缺哪个文件，对应字体就退回引擎默认（不影响打开，仅该字体字形不精确）。
> 至少放 `Songti.ttf` 一个，即可保证正文中文字形正确。

## 字体文件来源（合规提示）

- 可自行准备已获授权的宋体/黑体/楷体/仿宋字体文件（如方正、汉仪等商业授权，或 Windows 自带的 SimSun/SimHei/KaiTi/FangSong）。
- 开源替代（SIL OFL 协议，可免费商用）：
  - 思源宋体（Source Han Serif / Noto Serif CJK SC）—— 可当作宋体
  - 思源黑体（Source Han Sans / Noto Sans CJK SC）—— 可当作黑体
  - 下载时选 `.ttf`（或 `.otf`）单字体，不要选 `.ttc` 集合文件。

## 注意事项

1. **必须是 `.ttf` / `.otf` 单字体**，`.ttc` 集合可能无法被正确解析（引擎虽有 `faceIndex` 支持，但建议直接用单字体更稳）。
2. 放入后重新 `npm run dev` 或 `npm run build`，`public/` 下的文件会被 Vite 自动拷贝到产物根目录。
3. 桌面端（Tauri）打包时，这些字体会随 `dist` 一起内嵌进二进制，体积会相应增加（中文字体单个约 8–20MB，请按需取舍，只放真正用到的字体）。
