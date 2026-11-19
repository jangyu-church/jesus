/* ==========================================================
   지도별 3D 장식
   - decorJeru: 주후 30년 무렵 예루살렘 복원 모형 (상징적 축척이 아닌 실제 크기 m 기준)
   - decorLand: 넓은 지도의 마을 모형 (위치를 알아보기 위한 상징적 크기)
   ========================================================== */
import { TEMPLE_MOUNT, FIRST_WALL, SECOND_WALL, GATES, BUILDINGS, TOWERS, POOLS, TOMBS, DISTRICTS, GROVES, QUARRY } from './city.js';

const rng = (seed) => { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
const inPoly = (la, lo, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ai, bi] = poly[i], [aj, bj] = poly[j]; if ((ai > la) !== (aj > la) && lo < (bj - bi) * (la - ai) / (aj - ai) + bi) c = !c; } return c; };

function stoneTexture(THREE, tint = [222, 205, 168]) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = `rgb(${tint})`; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) {
    const x = k * 64 + (r % 2) * 32, y = r * 32, v = Math.random() * 26 - 13;
    g.fillStyle = `rgb(${tint.map((t) => t + v)})`; g.fillRect(x + 2, y + 2, 60, 28);
  }
  g.strokeStyle = 'rgba(80,60,30,.35)'; g.lineWidth = 2;
  for (let r = 0; r <= 8; r++) { g.beginPath(); g.moveTo(0, r * 32); g.lineTo(256, r * 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function decorJeru(ctx) {
  const { THREE, X, Z, meters, mU, decor, routes } = ctx;
  const yS = ctx.yS, base = ctx.yAt(31.7765, 35.24) - (meters(31.7765, 35.24) * yS); // yAt(m) = (m - BASE)*yS
  const Y = (m) => base + m * yS;           // 해발 m → 장면 높이
  const ground = (la, lo) => ctx.yAt(la, lo);
  const H = (m) => m * mU * 1.2;            // 건물 높이 m → 단위 (건물은 과장하지 않음)
  const M = (m) => m * mU;                  // 수평 m → 단위
  const stoneTex = stoneTexture(THREE);
  const mat = {
    wall: new THREE.MeshStandardMaterial({ color: 0xe0cfa8, map: stoneTex, roughness: 0.9 }),
    platform: new THREE.MeshStandardMaterial({ color: 0xe9ddc0, roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.55 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 0.9 }),
    col: new THREE.MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.6 }),
    water: new THREE.MeshStandardMaterial({ color: 0x4b93ad, roughness: 0.15, metalness: 0.1 }),
    tree: new THREE.MeshStandardMaterial({ color: 0x66713e, roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4a33, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x8c7a5c, roughness: 1 }),
    altar: new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.8 })
  };
  const o = new THREE.Object3D();
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  /* --- 성전산 기단 --- */
  let top = 0;
  for (let k = 0; k < 200; k++) {
    const la = 31.7757 + Math.random() * 0.0047, lo = 35.2337 + Math.random() * 0.0039;
    if (inPoly(la, lo, TEMPLE_MOUNT)) top = Math.max(top, meters(la, lo));
  }
  top = Math.max(top, 738);
  const TMY = Y(top);
  const shape = new THREE.Shape(TEMPLE_MOUNT.map(([la, lo]) => new THREE.Vector2(X(lo), -Z(la))));
  const plat = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), mat.platform);
  plat.position.y = TMY; decor.add(plat);
  // 옹벽 (지형을 따라 내려가는 거대한 벽)
  const wallStrip = (a, b, topY, extra = 0) => {
    const n = Math.max(2, Math.ceil(Math.hypot(X(b[1]) - X(a[1]), Z(b[0]) - Z(a[0])) / 0.4));
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t;
      const x = X(lo), z = Z(la), gy = ground(la, lo) - H(3);
      pos.push(x, topY(la, lo) + extra, z, x, Math.min(gy, topY(la, lo) - 0.01), z);
      uv.push(t * 30, 3, t * 30, 0);
      if (i) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat.wall); m.material.side = THREE.DoubleSide; decor.add(m);
  };
  TEMPLE_MOUNT.forEach((p, i) => wallStrip(p, TEMPLE_MOUNT[(i + 1) % 4], () => TMY, H(3)));

  /* --- 주랑 (서·북·동) 과 왕의 주랑 (남) --- */
  const colGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const cols = [], roofs = [];
  const edge = (a, b, inset, rowsN, colH, width, every) => {
    const ax = X(a[1]), az = Z(a[0]), bx = X(b[1]), bz = Z(b[0]);
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = -uz, nz = ux;            // 안쪽 방향 (다각형 시계 방향 기준으로 확인)
    const cx = (X(TEMPLE_MOUNT[0][1]) + X(TEMPLE_MOUNT[2][1])) / 2, cz = (Z(TEMPLE_MOUNT[0][0]) + Z(TEMPLE_MOUNT[2][0])) / 2;
    const sgn = Math.sign((cx - (ax + bx) / 2) * nx + (cz - (az + bz) / 2) * nz) || 1;
    const n = Math.floor(len / M(every));
    for (let r = 0; r < rowsN; r++) {
      const off = M(inset + r * width / Math.max(1, rowsN - 1)) * sgn;
      for (let k = 1; k < n; k++) cols.push({ x: ax + ux * len * k / n + nx * off, z: az + uz * len * k / n + nz * off, h: H(colH), r: M(0.8) });
    }
    roofs.push({ x: (ax + bx) / 2 + nx * M(inset + width / 2) * sgn, z: (az + bz) / 2 + nz * M(inset + width / 2) * sgn, len: len * 0.985, w: M(width + 3), y: TMY + H(colH), rot: Math.atan2(-uz, ux), t: H(rowsN > 2 ? 9 : 2.2) });
  };
  const [NW, NE, SE, SW] = TEMPLE_MOUNT;
  edge(SW, NW, 3, 2, 11, 14, 6.5); edge(NW, NE, 3, 2, 11, 14, 6.5); edge(NE, SE, 3, 2, 11, 14, 6.5);
  edge(SE, SW, 2, 4, 15, 31, 7);           // 왕의 주랑: 네 줄 기둥 (요세푸스는 162개라고 기록)
  const cm = new THREE.InstancedMesh(colGeo, mat.col, cols.length);
  cols.forEach((c, i) => { o.position.set(c.x, TMY + c.h / 2, c.z); o.rotation.set(0, 0, 0); o.scale.set(c.r, c.h, c.r); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
  decor.add(cm);
  roofs.forEach((r) => { const m = box(r.len, r.t, r.w, mat.roof); m.position.set(r.x, r.y + r.t / 2, r.z); m.rotation.y = r.rot; decor.add(m); });

  /* --- 성전 (나오스) 과 뜰 --- */
  const T = BUILDINGS.naos, tg = new THREE.Group();
  tg.position.set(X(T.lon), TMY, Z(T.lat)); tg.rotation.y = T.rot * Math.PI / 180; decor.add(tg);
  const add = (m, x, y, z, g = tg) => { m.position.set(M(x), y, M(z)); g.add(m); return m; };
  // 안뜰 담 (이스라엘의 뜰·제사장의 뜰, 미쉬나 미돗 187×135규빗 ≈ 94×68m)
  const court = (cx, w, d, h) => {
    [[0, -d / 2, w, 3], [0, d / 2, w, 3], [-w / 2, 0, 3, d], [w / 2, 0, 3, d]].forEach(([x, z, ww, dd]) => add(box(M(ww), H(h), M(dd), mat.white), cx + x, H(h) / 2, z));
  };
  add(box(M(150), H(1.5), M(110), mat.platform), 15, H(0.75), 0);             // 안쪽 기단 (계단으로 오르는 단)
  court(-5, 94, 68, 11);                                                         // 이스라엘·제사장의 뜰
  court(76, 68, 68, 9);                                                          // 여인의 뜰
  const lift = H(1.5);
  // 성소: 길이·높이 100규빗(≈50m), 앞쪽 현관 폭 100규빗, 본채 폭 70규빗
  add(box(M(36), H(40), M(35), mat.white), -18, lift + H(20), 0);
  add(box(M(6), H(50), M(50), mat.white), 3, lift + H(25), 0);
  add(box(M(37), H(1), M(36), mat.gold), -18, lift + H(40.5), 0);
  add(box(M(6.4), H(1), M(50.4), mat.gold), 3, lift + H(50.5), 0);
  add(box(M(1.2), H(20), M(10), new THREE.MeshStandardMaterial({ color: 0x3a2a18 })), 6.2, lift + H(14), 0);    // 문 (휘장)
  add(box(M(16), H(5), M(16), mat.altar), 22, lift + H(2.5), 0);                 // 번제단 (32규빗)
  add(box(M(4), H(3), M(12), mat.altar), 22, lift + H(1.5), 11);                 // 제단 경사로

  /* --- 안토니아 요새 --- */
  const fort = (B, towerH, sweH) => {
    const g = new THREE.Group(); g.position.set(X(B.lon), 0, Z(B.lat)); g.rotation.y = B.rot * Math.PI / 180; decor.add(g);
    const gy = ground(B.lat, B.lon);
    add(box(M(B.w), H(B.h), M(B.d), mat.wall), 0, gy + H(B.h / 2) - H(2), 0, g);
    if (B.towers) [[-1, -1, towerH], [1, -1, towerH], [-1, 1, towerH], [1, 1, sweH]].forEach(([sx, sz, th]) => add(box(M(14), H(th), M(14), mat.wall), sx * B.w / 2, gy + H(th / 2) - H(2), sz * B.d / 2, g));
    return g;
  };
  fort(BUILDINGS.antonia, 30, 40);
  /* --- 헤롯 궁과 세 탑 --- */
  const pal = BUILDINGS.palace, pg = new THREE.Group(); pg.position.set(X(pal.lon), 0, Z(pal.lat)); pg.rotation.y = pal.rot * Math.PI / 180; decor.add(pg);
  const pgy = ground(pal.lat, pal.lon);
  [[-45, 0, 40, 300], [45, 0, 40, 300], [0, -140, 130, 30], [0, 140, 130, 30], [0, 0, 50, 26]].forEach(([x, z, w, d]) => add(box(M(w), H(14), M(d), mat.wall), x, pgy + H(5), z, pg));
  add(box(M(80), H(0.6), M(250), new THREE.MeshStandardMaterial({ color: 0x7f8d4c })), 0, pgy + H(0.4), 0, pg);    // 궁전 정원
  TOWERS.forEach((t) => { const m = box(M(t.s), H(t.h), M(t.s), mat.wall); m.position.set(X(t.lon), ground(t.lat, t.lon) + H(t.h / 2) - H(2), Z(t.lat)); decor.add(m); });
  fort(BUILDINGS.hasmonean, 0, 0);

  /* --- 성벽과 망대 --- */
  const gates = GATES.map((g) => [X(g.lon), Z(g.lat)]);
  const nearGate = (x, z) => gates.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < M(9));
  const segs = [], towers = [];
  [FIRST_WALL, SECOND_WALL].forEach((line) => {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const len = Math.hypot(X(b[1]) - X(a[1]), Z(b[0]) - Z(a[0])), n = Math.max(1, Math.round(len / M(12)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t, x = X(lo), z = Z(la);
        if (nearGate(x, z)) continue;
        segs.push({ x, z, y: ground(la, lo), len: len / n * 1.04, rot: Math.atan2(-(Z(b[0]) - Z(a[0])), X(b[1]) - X(a[1])) });
        if (k % 5 === 0) towers.push({ x, z, y: ground(la, lo) });
      }
    }
  });
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat.wall, segs.length);
  segs.forEach((s, i) => { o.position.set(s.x, s.y + H(4), s.z); o.rotation.set(0, s.rot, 0); o.scale.set(s.len, H(12), M(4)); o.updateMatrix(); wm.setMatrixAt(i, o.matrix); });
  const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat.wall, towers.length);
  towers.forEach((s, i) => { o.position.set(s.x, s.y + H(6), s.z); o.rotation.set(0, 0, 0); o.scale.set(M(10), H(18), M(10)); o.updateMatrix(); tm.setMatrixAt(i, o.matrix); });
  decor.add(wm, tm);

  /* --- 집들 (경로 위는 비워 길이 되게) --- */
  const cell = M(20), hash = new Map();
  Object.values(routes).forEach((legs) => legs.forEach((l) => { if (l.mode === 'alt') return; for (let k = 1; k < l.pts.length; k++) { const a = l.pts[k - 1], b = l.pts[k], n = 12; for (let t = 0; t <= n; t++) { const x = X(a[1] + (b[1] - a[1]) * t / n), z = Z(a[0] + (b[0] - a[0]) * t / n); const key = Math.round(x / cell) + ',' + Math.round(z / cell); (hash.get(key) || hash.set(key, []).get(key)).push([x, z]); } } }));
  const nearRoute = (x, z, r) => { const cx = Math.round(x / cell), cz = Math.round(z / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = hash.get((cx + i) + ',' + (cz + j)); if (a && a.some(([px, pz]) => Math.hypot(px - x, pz - z) < r)) return true; } return false; };
  const blocked = (la, lo) => inPoly(la, lo, TEMPLE_MOUNT) || Math.hypot((lo - BUILDINGS.palace.lon) * 94.7e3, (la - BUILDINGS.palace.lat) * 111e3) < 165 && Math.abs((lo - BUILDINGS.palace.lon) * 94.7e3) < 75 || Math.hypot((lo - BUILDINGS.antonia.lon) * 94.7e3, (la - BUILDINGS.antonia.lat) * 111e3) < 70;
  const tone = { upper: [0xe6dcc4, 0xddd0b2, 0xece3cf, 0xd6c7a5], lower: [0xcdb991, 0xc4ae85, 0xd3c19d, 0xbca57d], village: [0xcbb68e, 0xc1aa80, 0xd0bd98] };
  const houses = [];
  DISTRICTS.forEach((D) => {
    const r = rng(D.id); let made = 0, tries = 0;
    const la0 = Math.min(...D.poly.map((p) => p[0])), la1 = Math.max(...D.poly.map((p) => p[0])), lo0 = Math.min(...D.poly.map((p) => p[1])), lo1 = Math.max(...D.poly.map((p) => p[1]));
    while (made < D.n && tries < D.n * 8) {
      tries++;
      const la = la0 + r() * (la1 - la0), lo = lo0 + r() * (lo1 - lo0);
      if (!inPoly(la, lo, D.poly) || blocked(la, lo)) continue;
      const x = X(lo), z = Z(la), s = D.size[0] + r() * (D.size[1] - D.size[0]);
      if (nearRoute(x, z, M(s * 0.7 + 4))) continue;
      const h = D.h[0] + r() * (D.h[1] - D.h[0]);
      houses.push({ x, z, y: ground(la, lo), w: M(s), d: M(s * (0.7 + r() * 0.5)), h: H(h), rot: (r() - 0.5) * 0.25, c: tone[D.tone][Math.floor(r() * tone[D.tone].length)] });
      made++;
    }
  });
  const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.92 }), houses.length);
  const colr = new THREE.Color();
  houses.forEach((b, i) => { o.position.set(b.x, b.y + b.h / 2 - H(1.5), b.z); o.rotation.set(0, b.rot, 0); o.scale.set(b.w, b.h + H(1.5), b.d); o.updateMatrix(); hm.setMatrixAt(i, o.matrix); hm.setColorAt(i, colr.set(b.c)); });
  decor.add(hm);
  const rf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), houses.length);
  houses.forEach((b, i) => { o.position.set(b.x, b.y + b.h + H(0.25), b.z); o.rotation.set(0, b.rot, 0); o.scale.set(b.w * 0.86, H(0.5), b.d * 0.86); o.updateMatrix(); rf.setMatrixAt(i, o.matrix); rf.setColorAt(i, colr.set(b.c).multiplyScalar(0.8)); });
  decor.add(rf);

  /* --- 못 · 무덤 · 채석장 --- */
  POOLS.forEach((p) => {
    const parts = p.split ? [-0.27, 0.27] : [0];
    parts.forEach((f) => { const m = box(M(p.w * (p.split ? 0.45 : 1)), H(0.4), M(p.d), mat.water); m.position.set(X(p.lon) + M(p.w * f), ground(p.lat, p.lon) + H(0.5), Z(p.lat)); m.rotation.y = p.rot * Math.PI / 180; decor.add(m); });
  });
  TOMBS.forEach(([la, lo], i) => {
    const g = ground(la, lo);
    const b = box(M(7), H(8), M(7), mat.wall); b.position.set(X(lo), g + H(4), Z(la)); decor.add(b);
    const c = new THREE.Mesh(i === 0 ? new THREE.ConeGeometry(M(3.5), H(9), 24) : new THREE.ConeGeometry(M(5), H(5), 4), mat.wall); c.position.set(X(lo), g + H(8) + H(i === 0 ? 4.5 : 2.5), Z(la)); if (i) c.rotation.y = Math.PI / 4; decor.add(c);
  });
  { const q = QUARRY, g = ground(q.lat, q.lon);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(M(q.r), 40).rotateX(-Math.PI / 2), mat.dark); pit.position.set(X(q.lon), g + H(0.4), Z(q.lat)); decor.add(pit);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(M(7), 0), new THREE.MeshStandardMaterial({ color: 0xb8a684, roughness: 1, flatShading: true }));
    rock.scale.set(1, H(10) / M(7), 0.8); rock.position.set(X(35.22968), ground(31.7784, 35.22968) + H(4), Z(31.7784)); decor.add(rock);
  }

  /* --- 올리브 숲 --- */
  const trees = [];
  GROVES.forEach((G, gi) => {
    const r = rng('g' + gi); let made = 0, tries = 0;
    const la0 = Math.min(...G.poly.map((p) => p[0])), la1 = Math.max(...G.poly.map((p) => p[0])), lo0 = Math.min(...G.poly.map((p) => p[1])), lo1 = Math.max(...G.poly.map((p) => p[1]));
    while (made < G.n && tries < G.n * 6) {
      tries++;
      const la = la0 + r() * (la1 - la0), lo = lo0 + r() * (lo1 - lo0);
      if (!inPoly(la, lo, G.poly)) continue;
      const x = X(lo), z = Z(la); if (nearRoute(x, z, M(5))) continue;
      trees.push({ x, z, y: ground(la, lo), s: 3 + r() * 2.5 }); made++;
    }
  });
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat.tree, trees.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.45, 1, 6), mat.trunk, trees.length);
  trees.forEach((t, i) => {
    o.rotation.set(0, i, 0);
    o.position.set(t.x, t.y + H(t.s * 0.9), t.z); o.scale.set(M(t.s), H(t.s * 0.7), M(t.s)); o.updateMatrix(); crown.setMatrixAt(i, o.matrix);
    o.position.set(t.x, t.y + H(1.2), t.z); o.scale.set(M(1), H(2.6), M(1)); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
  });
  decor.add(crown, trunk);
}

export function decorLand(ctx) {
  const { THREE, X, Z, meters, yAt, decor, U } = ctx;
  const places = ctx.places;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 0.9 });
  const o = new THREE.Object3D(); const houses = [];
  const deg = 111 * U;   // 1도 = deg 단위
  Object.entries(places).forEach(([id, p]) => {
    if (p.region || p.rank > 2) return;
    const r = rng(id), n = p.rank === 1 ? 60 : 30, R = p.rank === 1 ? 0.5 : 0.32;
    let made = 0, tries = 0;
    while (made < n && tries < n * 6) {
      tries++;
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * R;
      const la = p.lat + Math.sin(a) * rr / deg, lo = p.lon + Math.cos(a) * rr / (deg * ctx.K);
      if (meters(la, lo) < 5 && !(la > 31.6 && lo > 35.3)) continue;
      const w = 0.05 + r() * 0.05, h = 0.03 + r() * 0.03;
      houses.push({ x: X(lo), y: yAt(la, lo), z: Z(la), w, d: w * (0.7 + r() * 0.5), h, rot: r() * Math.PI });
      made++;
    }
  });
  const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, houses.length);
  houses.forEach((b, i) => { o.position.set(b.x, b.y + b.h / 2, b.z); o.rotation.set(0, b.rot, 0); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); hm.setMatrixAt(i, o.matrix); });
  decor.add(hm);
  // 예루살렘 성전 (상징)
  const j = places.jerusalemL;
  if (j) {
    const g = new THREE.Group(); g.position.set(X(j.lon), yAt(j.lat, j.lon), Z(j.lat)); decor.add(g);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0xe9ddc0 })); plat.position.y = 0.025; g.add(plat);
    const naos = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0xf6f0e2 })); naos.position.y = 0.09; g.add(naos);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.006, 0.052), new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.3 })); gold.position.y = 0.133; g.add(gold);
  }
  void roofMat;
}
