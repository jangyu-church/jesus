# 지형 굽기: python3 tools/bake.py land|jeru
# 고도 타일 -> data/<이름>/relief.jpg(지형 그림) · height.bin(높이) · seamask.png · meta.json
import sys, os, math, json, heapq
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = sys.argv[1]
CFG = {
  'land': dict(z=10, lon0=29.5, lon1=36.0, lat0=29.6, lat1=33.2, W=4096, GW=900,
               seas=[(32.5, 33.5), (29.7, 32.58)], lakes=[(32.82, 35.59), (31.5, 35.5)]),
  'jeru': dict(z=15, lon0=35.212, lon1=35.272, lat0=31.758, lat1=31.795, W=4096, GW=900, seas=[], lakes=[]),
}[NAME]
T = os.path.join(HERE, 'tiles', NAME) + '/'
OUT = os.path.join(HERE, '..', 'data', NAME) + '/'
os.makedirs(OUT, exist_ok=True)
z = CFG['z']; n = 2 ** z
LON0, LON1, LAT0, LAT1 = CFG['lon0'], CFG['lon1'], CFG['lat0'], CFG['lat1']
tx = lambda lo: int((lo + 180) / 360 * n)
ty = lambda la: int((1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * n)
X0, X1, Y0, Y1 = tx(LON0), tx(LON1), ty(LAT1), ty(LAT0)
mos = np.zeros(((Y1 - Y0 + 1) * 256, (X1 - X0 + 1) * 256), np.float32)
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        a = np.asarray(Image.open(f'{T}{z}_{x}_{y}.png').convert('RGB')).astype(np.float32)
        mos[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
LATC = (LAT0 + LAT1) / 2
W = CFG['W']; H = int(round(W * (LAT1 - LAT0) / ((LON1 - LON0) * math.cos(math.radians(LATC)))))
lon = LON0 + (np.arange(W) + .5) / W * (LON1 - LON0)
lat = LAT1 - (np.arange(H) + .5) / H * (LAT1 - LAT0)
px = (lon + 180) / 360 * n * 256 - X0 * 256
lr = np.radians(lat); py = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n * 256 - Y0 * 256
PX, PY = np.meshgrid(px - .5, py - .5)
h = ndimage.map_coordinates(mos, [PY, PX], order=1, mode='nearest').astype(np.float32)
if NAME == 'jeru': h = ndimage.gaussian_filter(h, 7)
LON, LAT = np.meshgrid(lon, lat)
def ij(la, lo): return int((LAT1 - la) / (LAT1 - LAT0) * H), int((lo - LON0) / (LON1 - LON0) * W)
sea = np.zeros((H, W), bool)
if CFG['seas']:
    lab, _ = ndimage.label(h <= 0.5)
    for s in CFG['seas']:
        i, j = ij(*s)
        if lab[i, j] > 0: sea |= lab == lab[i, j]
lakes = np.zeros((H, W), bool)
for s in CFG['lakes']:
    i, j = ij(*s); r = ndimage.label(h < h[i, j] + 4)[0]; lakes |= (r == r[i, j])
lakes &= ~sea
land = ~sea
cell = (LAT1 - LAT0) / H * 111000
def shade(hh, az, alt, zf):
    gy, gx = np.gradient(hh * zf, cell)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    az = math.radians(az); alt = math.radians(alt)
    return np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect + math.pi), 0, 1)
def ramp(v, stops):
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([[int(s[1][i:i + 2], 16) for i in (1, 3, 5)] for s in stops], np.float32)
    return np.stack([np.interp(v, xs, cs[:, k]) for k in range(3)], -1)
rng = np.random.default_rng(5)
def fbm(o=6, base=256):
    acc = np.zeros((H, W), np.float32); amp = 1
    for k in range(o):
        s = 2 ** k; g = rng.standard_normal((H // max(1, base // s) + 2, W // max(1, base // s) + 2)).astype(np.float32)
        acc += amp * np.asarray(Image.fromarray(g).resize((W, H), Image.BICUBIC)); amp *= .55
    return acc / 2.2
nz = fbm()
sm = np.clip
gy, gx = np.gradient(np.maximum(h, -1000), cell); slope = np.degrees(np.arctan(np.hypot(gx, gy)))

if NAME == 'land':
    zf = 2.6
    hl = np.where(land, h, h * 0.15)
    hs = 0.55 * shade(hl, 315, 38, zf) + 0.25 * shade(hl, 270, 45, zf) + 0.20 * shade(hl, 0, 55, zf)
    humid = [(-450, '#7f8f55'), (-200, '#88955a'), (0, '#8a9a5a'), (150, '#98a060'), (400, '#a9a468'), (700, '#b8a771'), (1000, '#b2946a'), (1500, '#a27e5a'), (2200, '#9a8a7a')]
    arid = [(-450, '#c9ad80'), (-200, '#d0b585'), (0, '#dcc493'), (300, '#d6ba86'), (700, '#c9a675'), (1100, '#b98f62'), (1700, '#a27a58'), (2400, '#8f7a68')]
    hh = np.maximum(h, -450)
    distsea = ndimage.distance_transform_edt(~sea) * cell / 1000
    # 건조도: 남쪽(네게브·시내)·요단 동쪽 사막·유대 광야(분수령 동쪽)
    ar = sm((31.6 - LAT) / 0.9, 0, 1) + sm((LON - 35.9) / 0.5, 0, 1)
    ar += 0.75 * sm((LON - 35.27) / 0.12, 0, 1) * sm((32.05 - LAT) / 0.35, 0, 1) * sm((LAT - 31.0) / 0.3, 0, 1) * sm((35.62 - LON) / 0.08, 0, 1)
    ar += 0.6 * sm((LON - 35.65) / 0.2, 0, 1) * sm((31.9 - LAT) / 0.4, 0, 1)
    ar -= 0.5 * sm((32.3 - LAT) * 0 + (LAT - 32.25) / 0.3, 0, 1)  # 갈릴리는 푸르게
    ar = sm(ar + 0.1 * nz, 0, 1)
    col = ramp(hh, humid) * (1 - ar[..., None]) + ramp(hh, arid) * ar[..., None]
    # 나일 삼각주 · 나일 계곡의 경작지
    farm = land & (h < 28) & (LAT > 29.95) & (LAT < 31.62) & (LON > 29.95) & (LON < 32.35)
    farm |= land & (h < 60) & (LAT <= 30.1) & (np.abs(LON - 31.22 - (30.1 - LAT) * 0.05) < 0.17)
    farm = ndimage.binary_opening(farm, iterations=2)
    fsoft = ndimage.gaussian_filter(farm.astype(np.float32), 4) * sm((32.25 - LON) / 0.25, 0, 1) * (0.82 + 0.18 * sm(nz + .5, 0, 1))
    farmc = np.array([112, 134, 72], np.float32) * (1 + 0.10 * nz)[..., None]
    col = col * (1 - fsoft[..., None]) + farmc * fsoft[..., None]
    col *= (1 + 0.06 * nz)[..., None]
    rk = sm((slope - 12) / 16, 0, 0.5)[..., None]
    col = col * (1 - rk) + np.array([125, 108, 92], np.float32) * rk
    col[lakes] = [72, 140, 166]
    blur = ndimage.gaussian_filter(np.maximum(h, 0), 8)
    ao = np.clip(1 + (np.maximum(h, 0) - blur) / 700, 0.7, 1.15)
    col = col * ((0.42 + 0.78 * hs) * ao)[..., None]
    d = np.maximum(-h, 0)
    seac = ramp(d, [(0, '#86c9c9'), (25, '#5fb0bd'), (120, '#3f92ae'), (600, '#2f7499'), (1500, '#225b82'), (3000, '#173f63')])
    coast = ndimage.distance_transform_edt(sea) * cell / 1000
    seac += np.array([40, 40, 30]) * sm((3 - coast) / 3, 0, 1)[..., None]
    out = np.where(sea[..., None], seac, col)
    # 요단강 · 나일강 (가장 낮은 골짜기를 따라)
    def lowpath(a, b, pad=40):
        (i0, j0), (i1, j1) = ij(*a), ij(*b)
        ia, ib = max(min(i0, i1) - pad, 0), min(max(i0, i1) + pad, H - 1); ja, jb = max(min(j0, j1) - pad, 0), min(max(j0, j1) + pad, W - 1)
        C = h[ia:ib + 1, ja:jb + 1]; C = (C - C.min()) + 1; C = C ** 2
        g = np.full(C.shape, np.inf); s = (i0 - ia, j0 - ja); t = (i1 - ia, j1 - ja); g[s] = 0; prev = {}
        pq = [(0, s)]
        while pq:
            f, u = heapq.heappop(pq)
            if u == t: break
            if f > g[u]: continue
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di == dj == 0: continue
                    v = (u[0] + di, u[1] + dj)
                    if 0 <= v[0] < C.shape[0] and 0 <= v[1] < C.shape[1]:
                        nv = g[u] + C[v] * (1.414 if di and dj else 1)
                        if nv < g[v]: g[v] = nv; prev[v] = u; heapq.heappush(pq, (nv, v))
        p = [t]
        while p[-1] != s: p.append(prev[p[-1]])
        return [(q[1] + ja, q[0] + ia) for q in p[::-1]]
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(img)
    rivers = [((32.70, 35.572), (31.78, 35.556)), ((33.05, 35.62), (32.90, 35.63)), ((30.06, 31.228), (29.62, 31.25))]
    for a, b in rivers:
        pts = lowpath(a, b, 30)
        dr.line(pts, fill=(64, 128, 160), width=4 if b[0] < 31 else 3, joint='curve')
    out = np.asarray(img).astype(np.float32)
else:
    # 예루살렘: 석회암 언덕, 계단식 밭, 기드론 골짜기, 동쪽의 광야 비탈
    zf = 2.2
    hs = 0.55 * shade(h, 315, 40, zf) + 0.25 * shade(h, 270, 48, zf) + 0.20 * shade(h, 0, 58, zf)
    rel = h
    pal = [(560, '#8b7a52'), (620, '#998b5d'), (680, '#a59c6c'), (720, '#b5ab80'), (760, '#c4b893'), (800, '#cfc4a3'), (830, '#d6ccad')]
    col = ramp(rel, pal)
    desert = sm((LON - 35.252) / 0.012, 0, 1)
    col = col * (1 - desert[..., None] * 0.6) + np.array([214, 190, 145], np.float32) * desert[..., None] * 0.6
    # 올리브·관목 점무늬
    dots = fbm(3, 8)
    veg = (dots > 0.55) & (slope > 4) & (h < 790) & (desert < 0.6)
    col[veg] = col[veg] * 0.78 + np.array([80, 92, 52]) * 0.22
    # 계단식 밭 (3m 간격 등고선을 은은하게)
    terr = np.abs(((h / 3.0) % 1) - 0.5) < 0.06
    col[terr & (slope > 6) & (slope < 25)] *= 0.97
    col *= (1 + 0.05 * nz)[..., None]
    rk = sm((slope - 18) / 15, 0, 0.45)[..., None]
    col = col * (1 - rk) + np.array([150, 138, 118], np.float32) * rk
    out = col * (0.38 + 0.85 * hs)[..., None]

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT + 'relief.jpg', quality=86, optimize=True, progressive=True)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((2048, int(H / 2)), Image.LANCZOS).save(OUT + 'relief-2k.jpg', quality=85, optimize=True, progressive=True)
GW = CFG['GW']; GH = int(round(GW * H / W))
if NAME == 'land':
    hm = np.where(sea, np.maximum(h, -3000) * 0.05 - 20, np.where(lakes, h - 15, h + 25))
    hm = ndimage.gaussian_filter(hm, 1.4)
else:
    hm = h
small = np.asarray(Image.fromarray(hm.astype(np.float32)).resize((GW, GH), Image.BILINEAR))
np.clip(np.round(small), -32000, 32000).astype('<i2').tofile(OUT + 'height.bin')
m = sea.astype(np.uint8) * 255
Image.fromarray(m).resize((1024, int(round(1024 * H / W))), Image.BILINEAR).save(OUT + 'seamask.png', optimize=True)
np.save(os.path.join(HERE, f'{NAME}-h.npy'), h); np.save(os.path.join(HERE, f'{NAME}-sea.npy'), sea | lakes)
meta = dict(lon0=LON0, lon1=LON1, lat0=LAT0, lat1=LAT1, latc=LATC, gw=GW, gh=GH, tw=W, th=H, hmin=float(h.min()), hmax=float(h.max()))
json.dump(meta, open(OUT + 'meta.json', 'w'))
print(NAME, meta)
