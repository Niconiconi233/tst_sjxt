"""生成应用图标源文件（1024x1024 PNG），供 tauri icon 生成全套图标。

设计：深蓝渐变圆角方块 + 白色对勾 + 顶部细亮线，体现"审计核查"语义。
仅使用标准库（zlib / struct），无第三方依赖。
"""

import struct
import zlib

W = H = 1024
R = 190  # 圆角半径


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_alpha(x, y):
    """圆角矩形内部判定，返回 0~1 的覆盖率（带 1.5px 抗锯齿）。"""
    cx = min(max(x, R), W - R)
    cy = min(max(y, R), H - R)
    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    if x < R and y < R or x > W - R and y < R or x < R and y > H - R or x > W - R and y > H - R:
        return max(0.0, min(1.0, (R - d) / 1.5 + 0.5))
    if x < 0 or x > W or y < 0 or y > H:
        return 0.0
    return 1.0


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def build():
    p1 = (330, 556)
    p2 = (462, 690)
    p3 = (706, 372)
    half = 37.0

    rows = []
    for y in range(H):
        row = bytearray()
        for x in range(W):
            a = rounded_alpha(x, y)
            if a <= 0:
                row += bytes((0, 0, 0, 0))
                continue

            # 对角渐变
            t = (x / W) * 0.55 + (y / H) * 0.45
            r = int(lerp(36, 12, t))
            g = int(lerp(105, 52, t))
            b = int(lerp(190, 110, t))

            # 顶部高光线
            if y < 6:
                glow = 1 - y / 6
                r = int(lerp(r, 235, glow * 0.35))
                g = int(lerp(g, 244, glow * 0.35))
                b = int(lerp(b, 255, glow * 0.35))

            # 对勾
            d = min(
                seg_dist(x, y, p1[0], p1[1], p2[0], p2[1]),
                seg_dist(x, y, p2[0], p2[1], p3[0], p3[1]),
            )
            cover = max(0.0, min(1.0, (half - d) / 1.5 + 0.5))
            if cover > 0:
                r = int(lerp(r, 255, cover))
                g = int(lerp(g, 255, cover))
                b = int(lerp(b, 255, cover))

            row += bytes((r, g, b, int(a * 255)))
        rows.append(row)

    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

    with open("src-tauri/icons/source.png", "wb") as f:
        f.write(png)
    print("wrote src-tauri/icons/source.png", len(png), "bytes")


if __name__ == "__main__":
    build()
