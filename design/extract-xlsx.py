# -*- coding: utf-8 -*-
"""
從 .xlsx 擷取內嵌圖片，並把每張圖對回它錨定的儲存格與該列文字。
.xlsx 是 ZIP：圖在 xl/media/，錨點在 xl/drawings/drawingN.xml，
關聯在 xl/drawings/_rels/。全程只用內建 zipfile + xml，零安裝。
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

XLSX = r'd:\Git\VeloraProject\design\sample\Jewelry accessories\絲巾與飾品.xlsx'
OUT = r'd:\Git\VeloraProject\design\sample\xlsx_media'
os.makedirs(OUT, exist_ok=True)
w = sys.stdout.buffer

NS = {
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
}

z = zipfile.ZipFile(XLSX)
names = z.namelist()
media = sorted(n for n in names if n.startswith('xl/media/'))
w.write(('內嵌檔案 %d 個，其中 media %d 個\n' % (len(names), len(media))).encode())

# ── 共用字串 ────────────────────────────────────────────────
shared = []
if 'xl/sharedStrings.xml' in names:
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root.findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
w.write(('共用字串 %d 筆\n' % len(shared)).encode())

# ── 工作表 → 儲存格文字 ────────────────────────────────────
def col_letters(ref):
    return re.match(r'([A-Z]+)(\d+)', ref).groups()


sheets = [n for n in names if re.match(r'xl/worksheets/sheet\d+\.xml$', n)]
rowtext = {}    # sheet -> {row_index(0-based) -> {colLetter: text}}
for sh in sheets:
    root = ET.fromstring(z.read(sh))
    cells = {}
    for c in root.iter('{%s}c' % NS['m']):
        ref = c.get('r')
        if not ref:
            continue
        col, row = col_letters(ref)
        v = c.find('m:v', NS)
        isel = c.find('m:is', NS)
        if c.get('t') == 's' and v is not None:
            txt = shared[int(v.text)] if v.text and int(v.text) < len(shared) else ''
        elif isel is not None:
            txt = ''.join(t.text or '' for t in isel.iter('{%s}t' % NS['m']))
        else:
            txt = v.text if v is not None else ''
        if txt and txt.strip():
            cells.setdefault(int(row) - 1, {})[col] = txt.strip()
    rowtext[sh] = cells
    w.write(('%s：有內容的列 %d\n' % (sh, len(cells))).encode())

# ── 繪圖錨點 → 圖片 ────────────────────────────────────────
anchors = []      # (drawing, col, row, media path)
for dr in [n for n in names if re.match(r'xl/drawings/drawing\d+\.xml$', n)]:
    relp = dr.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels'
    rid2media = {}
    if relp in names:
        rr = ET.fromstring(z.read(relp))
        for rel in rr.findall('rel:Relationship', NS):
            tgt = rel.get('Target', '')
            if 'media/' in tgt:
                rid2media[rel.get('Id')] = 'xl/' + tgt.split('../')[-1]
    root = ET.fromstring(z.read(dr))
    for tag in ('twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor'):
        for an in root.findall('xdr:%s' % tag, NS):
            frm = an.find('xdr:from', NS)
            col = int(frm.find('xdr:col', NS).text) if frm is not None else -1
            row = int(frm.find('xdr:row', NS).text) if frm is not None else -1
            blip = an.find('.//a:blip', NS)
            if blip is None:
                continue
            rid = blip.get('{%s}embed' % NS['r'])
            mp = rid2media.get(rid)
            if mp:
                anchors.append((dr, col, row, mp))

w.write(('繪圖錨點 %d 個\n\n' % len(anchors)).encode())

# ── 落檔並列出對應 ─────────────────────────────────────────
COLNAME = lambda i: chr(65 + i) if i < 26 else chr(64 + i // 26) + chr(65 + i % 26)
first_sheet_cells = rowtext.get(sheets[0], {}) if sheets else {}

seen = set()
for i, (dr, col, row, mp) in enumerate(sorted(anchors, key=lambda a: (a[3], a[2], a[1]))):
    data = z.read(mp)
    ext = os.path.splitext(mp)[1] or '.png'
    base = 'cell_%s%d_%s%s' % (COLNAME(col), row + 1, os.path.splitext(os.path.basename(mp))[0], ext)
    out = os.path.join(OUT, base)
    open(out, 'wb').write(data)
    seen.add(mp)
    ctx = first_sheet_cells.get(row, {})
    label = ' | '.join('%s=%s' % (k, v[:34]) for k, v in sorted(ctx.items()))
    w.write(('  %-44s  儲存格 %s%d  %6d B  %s\n'
             % (base, COLNAME(col), row + 1, len(data), label)).encode('utf-8', 'replace'))

# 沒有錨點的圖也一併輸出
extra = 0
for mp in media:
    if mp in seen:
        continue
    data = z.read(mp)
    open(os.path.join(OUT, 'unanchored_' + os.path.basename(mp)), 'wb').write(data)
    extra += 1

w.write(('\n輸出 %d 張（另 %d 張無錨點）到 %s\n' % (len(anchors), extra, OUT)).encode())

# ── 印出前 40 列文字，理解表格結構 ──────────────────────────
if first_sheet_cells:
    w.write('\n---- 工作表前 40 列 ----\n'.encode('utf-8'))
    for r in sorted(first_sheet_cells)[:40]:
        cells = first_sheet_cells[r]
        line = '  第%3d列  ' % (r + 1) + '  '.join('%s:%s' % (k, v[:40]) for k, v in sorted(cells.items()))
        w.write((line + '\n').encode('utf-8', 'replace'))
