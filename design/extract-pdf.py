# -*- coding: utf-8 -*-
"""零安裝 PDF 影像擷取：DCTDecode 直接落 .jpg，FlateDecode 自行組 PNG，
   並辨識 /SMask 去背遮罩配對。不依賴任何第三方套件。"""
import re, os, sys, zlib, struct

PDF = r'd:\Git\VeloraProject\design\sample\Brochure\(2026) VUCA_Product Brochure_EN.pdf'
OUT = r'd:\Git\VeloraProject\design\sample\extracted'
os.makedirs(OUT, exist_ok=True)
d = open(PDF, 'rb').read()
log = sys.stdout.buffer


def png_write(path, w, h, data, mode):
    """mode: 'RGB'(3ch) 或 'L'(1ch)。data 為未過濾的原始像素列。"""
    ch = 3 if mode == 'RGB' else 1
    ctype = 2 if mode == 'RGB' else 0
    stride = w * ch
    raw = bytearray()
    for y in range(h):
        raw.append(0)                      # filter type 0 = None
        raw += data[y * stride:(y + 1) * stride]

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload
                + struct.pack('>I', zlib.crc32(tag + payload) & 0xffffffff))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ctype, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 6)))
        f.write(chunk(b'IEND', b''))


# ── 收集所有影像物件 ────────────────────────────────────────
objs = {}
for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj', d):
    objs[int(m.group(1))] = m.start()

found = []
for m in re.finditer(rb'/Subtype\s*/Image', d):
    st = d.rfind(b'obj', max(0, m.start() - 4000), m.start())
    if st < 0:
        continue
    num_m = re.search(rb'(\d+)\s+\d+\s+obj\s*$', d[max(0, st - 24):st + 3])
    objnum = int(num_m.group(1)) if num_m else -1
    sm = d.find(b'stream', m.start())
    if sm < 0:
        continue
    header = d[st:sm]
    body0 = sm + len(b'stream')
    while d[body0:body0 + 1] in (b'\r', b'\n'):
        body0 += 1
    ln = re.search(rb'/Length\s+(\d+)', header)
    if not ln:
        continue
    body = d[body0:body0 + int(ln.group(1))]

    def gi(key):
        mm = re.search(key + rb'\s+(\d+)', header)
        return int(mm.group(1)) if mm else 0

    filt = re.search(rb'/Filter\s*/(\w+)', header)
    csm = re.search(rb'/ColorSpace\s*/(\w+)', header)
    smk = re.search(rb'/SMask\s+(\d+)\s+\d+\s+R', header)
    found.append({
        'obj': objnum, 'w': gi(rb'/Width'), 'h': gi(rb'/Height'),
        'bpc': gi(rb'/BitsPerComponent'),
        'filter': filt.group(1).decode() if filt else None,
        'cs': csm.group(1).decode() if csm else None,
        'smask': int(smk.group(1)) if smk else None,
        'body': body,
    })

masks = {f['smask'] for f in found if f['smask']}
log.write(('影像 %d 個，其中 %d 個帶去背遮罩 (SMask)\n\n' % (len(found), len(masks))).encode())

kept = 0
for f in found:
    # 略過裝飾小圖與 2x2 色塊
    if f['w'] * f['h'] < 40000:
        continue
    role = 'mask' if f['obj'] in masks else 'img'
    base = '%s_obj%03d_%dx%d' % (role, f['obj'], f['w'], f['h'])
    try:
        if f['filter'] == 'DCTDecode':
            p = os.path.join(OUT, base + '.jpg')
            open(p, 'wb').write(f['body'])
        elif f['filter'] == 'FlateDecode' and f['bpc'] == 8:
            dec = zlib.decompress(f['body'])
            mode = 'RGB' if f['cs'] == 'DeviceRGB' else 'L'
            need = f['w'] * f['h'] * (3 if mode == 'RGB' else 1)
            if len(dec) < need:
                log.write(('  跳過 %s：資料不足 (可能有 Predictor)\n' % base).encode())
                continue
            p = os.path.join(OUT, base + '.png')
            png_write(p, f['w'], f['h'], dec[:need], mode)
        else:
            continue
    except Exception as e:
        log.write(('  失敗 %s: %s\n' % (base, e)).encode())
        continue
    kept += 1
    log.write(('  ✓ %-34s %s  smask=%s\n'
               % (os.path.basename(p), f['filter'], f['smask'])).encode())

log.write(('\n共輸出 %d 檔到 %s\n' % (kept, OUT)).encode())
