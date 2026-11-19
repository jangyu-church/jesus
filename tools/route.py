# 경로 계산: python3 tools/route.py   (tools/bake.py land, jeru 를 먼저 실행)
# data.js 의 장소·경유지를 이어, 지형(경사)을 따라 걷는 길을 계산합니다.
# 예루살렘 지도에서는 city.js 의 성벽을 넘지 못하고 성문으로만 드나듭니다.
import json, math, heapq, os, subprocess
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
subprocess.run(['node', '-e', "Promise.all([import('../data.js'),import('../city.js')]).then(([d,c])=>require('fs').writeFileSync('src.json',JSON.stringify({...d,...c})))"], check=True)
D = json.load(open('src.json')); P = D['PLACES']

def setup(name, down):
    meta = json.load(open(f'../data/{name}/meta.json'))
    h = np.load(f'{name}-h.npy')[::down, ::down]; sea = np.load(f'{name}-sea.npy')[::down, ::down]
    H, W = h.shape
    L0, L1, A0, A1 = meta['lon0'], meta['lon1'], meta['lat0'], meta['lat1']
    toij = lambda la, lo: ((A1 - la) / (A1 - A0) * H, (lo - L0) / (L1 - L0) * W)
    toll = lambda i, j: (round(A1 - (i + .5) / H * (A1 - A0), 5), round(L0 + (j + .5) / W * (L1 - L0), 5))
    cellm = (A1 - A0) / H * 111000
    gy, gx = np.gradient(h, cellm); slope = np.hypot(gx, gy)
    block = sea.copy()
    if name == 'jeru':
        img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
        xy = lambda p: (toij(*p)[1], toij(*p)[0])
        for line, closed in ((D['FIRST_WALL'], False), (D['SECOND_WALL'], False), (D['TEMPLE_MOUNT'], True)):
            pts = [xy(p) for p in line] + ([xy(line[0])] if closed else [])
            dr.line(pts, fill=255, width=3)
        walls = np.asarray(img) > 0
        for g in D['GATES']:
            i, j = toij(g['lat'], g['lon']); r = 3.2
            yy, xx = np.ogrid[:H, :W]; walls[(yy - i) ** 2 + (xx - j) ** 2 <= r * r] = False
        block |= walls
        cost = 1 + 25 * slope ** 2
    else:
        cost = 1 + 30 * slope + np.maximum(h - 900, 0) / 400
    cost = cost.astype(np.float64); cost[block] = np.inf
    return dict(meta=meta, H=H, W=W, toij=toij, toll=toll, cost=cost, block=block, cellm=cellm)

def nearest_free(G, i, j):
    i, j = min(max(int(round(i)), 0), G['H'] - 1), min(max(int(round(j)), 0), G['W'] - 1)
    if not G['block'][i, j]: return (i, j)
    for r in range(1, 40):
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                a, b = i + di, j + dj
                if 0 <= a < G['H'] and 0 <= b < G['W'] and not G['block'][a, b]: return (a, b)
    return (i, j)

N8 = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)]
def astar(G, a, b, pad=30):
    C0 = G['cost']; H, W = G['H'], G['W']
    i0 = max(min(a[0], b[0]) - pad, 0); i1 = min(max(a[0], b[0]) + pad, H - 1)
    j0 = max(min(a[1], b[1]) - pad, 0); j1 = min(max(a[1], b[1]) + pad, W - 1)
    C = C0[i0:i1 + 1, j0:j1 + 1]
    s = (a[0] - i0, a[1] - j0); t = (b[0] - i0, b[1] - j0)
    g = np.full(C.shape, np.inf); g[s] = 0; prev = {}
    pq = [(0, s)]
    while pq:
        f, u = heapq.heappop(pq)
        if u == t: break
        gu = g[u]
        for di, dj, w in N8:
            v = (u[0] + di, u[1] + dj)
            if 0 <= v[0] < C.shape[0] and 0 <= v[1] < C.shape[1]:
                c = C[v]
                if c == np.inf: continue
                nv = gu + w * (c + C[u]) / 2
                if nv < g[v]:
                    g[v] = nv; prev[v] = u; heapq.heappush(pq, (nv + math.hypot(v[0] - t[0], v[1] - t[1]), v))
    if g[t] == np.inf:
        return None if pad > 200 else astar(G, a, b, pad * 3)
    path = [t]; u = t
    while u != s: u = prev[u]; path.append(u)
    return [(p[0] + i0, p[1] + j0) for p in path[::-1]]

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a = np.array(pts[0], float); b = np.array(pts[-1], float); ab = b - a; L = np.hypot(*ab) or 1
    dmax, idx = -1, 0
    for k in range(1, len(pts) - 1):
        p = np.array(pts[k], float); dd = abs(ab[0] * (a[1] - p[1]) - ab[1] * (a[0] - p[0])) / L
        if dd > dmax: dmax, idx = dd, k
    if dmax > eps: return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def km(pts):
    return sum(math.hypot((pts[k + 1][0] - pts[k][0]) * 111, (pts[k + 1][1] - pts[k][1]) * 111 * math.cos(math.radians(pts[k][0]))) for k in range(len(pts) - 1))

def chaikin(G, pts, n=2, check=True):
    for _ in range(n):
        if len(pts) < 3: break
        out = [pts[0]]
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            out += [[a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]]
        out.append(pts[-1])
        if check:
            bad = False
            for q in out[1:-1]:
                i, j = G['toij'](*q)
                if G['block'][min(int(i), G['H'] - 1), min(int(j), G['W'] - 1)]: bad = True; break
            if bad: break
        pts = out
    return pts

GRIDS = {'land': setup('land', 2), 'jeru': setup('jeru', 4)}
out = {}
for J in D['JOURNEYS']:
    G = GRIDS[J['map']]; legs = []; prev = None
    for si, s in enumerate(J['stops']):
        p = P[s['to']]; cur = (p['lat'], p['lon'])
        if prev is None: prev = cur; continue
        ctrl = [prev] + [tuple(v[:2]) for v in s.get('via', [])] + [cur]
        ij = [nearest_free(G, *G['toij'](*c)) for c in ctrl]
        seq = []
        for k in range(len(ij) - 1):
            r = astar(G, ij[k], ij[k + 1])
            if r is None: print('FAIL', J['id'], s['to'], k); r = [ij[k], ij[k + 1]]
            seq += r if not seq else r[1:]
        seq = rdp(seq, 0.8)
        pts = [list(prev)] + [list(G['toll'](*q)) for q in seq[1:-1]] + [list(cur)]
        pts = chaikin(G, pts, 2)
        pts = [[round(a, 5), round(b, 5)] for a, b in pts]
        legs.append(dict(stop=si, mode=s.get('mode', 'land'), km=round(km(pts), 3), pts=pts))
        if s.get('alt'):
            ap = ([] if s['alt'].get('free') else [list(prev)]) + [list(v) for v in s['alt']['via']] + ([] if s['alt'].get('free') else [list(cur)])
            ap = chaikin(G, ap, 3, check=False)
            legs.append(dict(stop=si, mode='alt', label=s['alt']['label'], km=round(km(ap), 3), pts=[[round(a, 5), round(b, 5)] for a, b in ap]))
        prev = cur
    out[J['id']] = legs
    tot = sum(l['km'] for l in legs if l['mode'] != 'alt')
    print(J['id'], len(legs), f'{tot:.2f} km')
json.dump(out, open('../data/routes.json', 'w'), separators=(',', ':'))
for f in ['src.json']: os.remove(f)
