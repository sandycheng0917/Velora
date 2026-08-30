# -*- coding: utf-8 -*-
"""
design/crop-exports.py — 把 shoot.mjs 產生的整頁截圖切成各區段預覽。

  node design/shoot.mjs          # 先產生 01-showcase-full.png
  python design/crop-exports.py

展示頁約 10700px 高，整張讀不清楚；切成五段才看得出各區塊的排版。
"""
import os
import sys

from PIL import Image

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')
SRC = os.path.join(OUT, '01-showcase-full.png')

# (輸出檔名, 起始 y, 結束 y)；None 代表接到內容底部
PANELS = [
    ('01a-hero.png', 0, 820),
    ('01b-categories.png', 760, 1800),
    ('01c-featured.png', 1780, 3000),
    ('01d-catalogue.png', 2960, 4500),
    ('01e-philosophy-footer.png', None, None),   # 頁尾往上 1700
]


def main():
    if not os.path.exists(SRC):
        print('找不到 %s，請先跑 node design/shoot.mjs' % os.path.relpath(SRC))
        return
    im = Image.open(SRC)
    W, H = im.size
    print('來源 %d × %d' % (W, H))

    # 找出真正的內容底部：懸浮 LINE 鈕是 fixed，會停在視窗底，需排除
    px = im.convert('RGB').load()
    base = px[W // 2, H - 3]
    bottom = H - 1
    while bottom > 0:
        row = [px[x, bottom] for x in range(0, W - 200, 40)]
        if any(sum(abs(c[i] - base[i]) for i in range(3)) > 12 for c in row):
            break
        bottom -= 1

    for name, a, b in PANELS:
        if a is None:
            a, b = max(0, bottom - 1700), bottom + 4
        b = min(b, H)
        if a >= H:
            continue
        im.crop((0, a, W, b)).save(os.path.join(OUT, name))
        print('  ✓ %-30s %d–%d  (%dpx)' % (name, a, b, b - a))

    print('完成。')


if __name__ == '__main__':
    main()
