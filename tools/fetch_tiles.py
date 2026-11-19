# 지형 타일 받기: python3 fetch_tiles.py <이름> <zoom> <lon0> <lon1> <lat0> <lat1>
import sys, math, os, subprocess
name, z = sys.argv[1], int(sys.argv[2]); lon0, lon1, lat0, lat1 = map(float, sys.argv[3:7])
n = 2 ** z
tx = lambda lo: int((lo + 180) / 360 * n)
ty = lambda la: int((1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * n)
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tiles', name); os.makedirs(d, exist_ok=True)
jobs = []
for x in range(tx(lon0), tx(lon1) + 1):
    for y in range(ty(lat1), ty(lat0) + 1):
        f = f'{d}/{z}_{x}_{y}.png'
        if not os.path.exists(f): jobs += [f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', '-o', f]
print(name, 'tiles x', tx(lon0), tx(lon1), 'y', ty(lat1), ty(lat0), 'new', len(jobs) // 3)
if jobs:
    p = subprocess.run(['xargs', '-P', '8', '-n', '3', 'curl', '-sS', '--retry', '3'], input='\n'.join(jobs).encode())
