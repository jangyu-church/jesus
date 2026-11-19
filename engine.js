/* ==========================================================
   3D 지형 지도 엔진 (여러 지도 · 여러 축척 공용)
   - 실제 고도(height.bin) + 미리 구운 지형 그림(relief.jpg)
   - 지도 폭을 늘 240단위로 맞춰, 600km 지역 지도와 5km 도시 지도를 같은 조작감으로 다룸
   - 여정 선, 따라가기, 이름표, 사회상 핀, 정치 지도 겹치기, 지도별 3D 장식(decor)
   ========================================================== */
import * as THREE from 'three';
import { MapControls } from './vendor/MapControls.js';
import { Line2 } from './vendor/Line2.js';
import { LineMaterial } from './vendor/LineMaterial.js';
import { LineGeometry } from './vendor/LineGeometry.js';

const PIN_ICON = { economy: '💰', politics: '👑', life: '🏠' };

export async function createEngine(opt) {
  const { host, labelsEl, map, places, journeys, routes, labels, pins, S } = opt;
  const JM = Object.fromEntries(journeys.map((j) => [j.id, j]));

  /* ---------- 렌더러 ---------- */
  const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const low = mobile || (navigator.deviceMemory && navigator.deviceMemory <= 4) || renderer.capabilities.maxTextureSize < 4096;
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  /* ---------- 자료 ---------- */
  const base = map.data + '/';
  opt.loadText?.('지형 자료를 불러오고 있습니다…');
  const meta = await fetch(base + 'meta.json').then((r) => r.json());
  const H16 = new Int16Array(await fetch(base + 'height.bin').then((r) => r.arrayBuffer()));
  const loader = new THREE.TextureLoader();
  opt.loadText?.('지형 그림을 입히고 있습니다…');
  const [relief, seamask] = await Promise.all([loader.loadAsync(base + (low ? 'relief-2k.jpg' : 'relief.jpg')), loader.loadAsync(base + 'seamask.png')]);
  relief.colorSpace = THREE.SRGBColorSpace;
  relief.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------- 좌표 (지도 폭 = 240단위) ---------- */
  const K = Math.cos(meta.latc * Math.PI / 180);
  const widthKm = (meta.lon1 - meta.lon0) * 111 * K;
  const U = 240 / widthKm;                         // 1km = U 단위
  const mU = U / 1000;                             // 1m = mU 단위 (수평)
  const lonMid = (meta.lon0 + meta.lon1) / 2, latMid = (meta.lat0 + meta.lat1) / 2;
  const WW = 240, HH = (meta.lat1 - meta.lat0) * 111 * U;
  const X = (lon) => (lon - lonMid) * 111 * K * U;
  const Z = (lat) => -(lat - latMid) * 111 * U;
  const isCity = map.unit === 'm';
  const BASE = isCity ? Math.floor(meta.hmin) - 5 : 0;  // 도시 지도는 가장 낮은 곳을 0으로
  let yS = mU * map.exag[S.exag];
  function meters(lat, lon) {
    const gx = (lon - meta.lon0) / (meta.lon1 - meta.lon0) * meta.gw - 0.5;
    const gy = (meta.lat1 - lat) / (meta.lat1 - meta.lat0) * meta.gh - 0.5;
    const x0 = Math.max(0, Math.min(meta.gw - 2, Math.floor(gx))), y0 = Math.max(0, Math.min(meta.gh - 2, Math.floor(gy)));
    const fx = Math.min(1, Math.max(0, gx - x0)), fy = Math.min(1, Math.max(0, gy - y0));
    const i = y0 * meta.gw + x0;
    return (H16[i] * (1 - fx) + H16[i + 1] * fx) * (1 - fy) + (H16[i + meta.gw] * (1 - fx) + H16[i + meta.gw + 1] * fx) * fy;
  }
  const yAt = (lat, lon) => (isCity ? meters(lat, lon) - BASE : meters(lat, lon)) * yS;
  const kmBetween = (a, b) => Math.hypot((b[0] - a[0]) * 111, (b[1] - a[1]) * 111 * Math.cos(a[0] * Math.PI / 180));

  /* ---------- 장면 ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 4000);
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false; controls.minDistance = isCity ? 1.2 : 2.2; controls.maxDistance = 320;
  controls.maxPolarAngle = 1.25; controls.zoomSpeed = 1.15; controls.rotateSpeed = 0.6;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const { RoomEnvironment } = await import('./vendor/RoomEnvironment.js');
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xfff5e6, 0x4a3c2a, 2.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.position.set(-90, 140, -70); scene.add(sun);

  /* ---------- 지형 ---------- */
  const step = low ? 2 : 1;
  const cols = Math.floor((meta.gw - 1) / step) + 1, rows = Math.floor((meta.gh - 1) / step) + 1;
  const tgeo = new THREE.PlaneGeometry(WW, HH, cols - 1, rows - 1).rotateX(-Math.PI / 2);
  const baseM = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) baseM[r * cols + c] = H16[(r * step) * meta.gw + c * step] - BASE;
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ map: relief, roughness: 0.96, metalness: 0, envMapIntensity: 0.25 }));
  scene.add(terrain);
  const skirt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  scene.add(skirt);
  const FLOOR = -3.2;
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(WW, HH).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1210 }));
  bottom.position.y = FLOOR; scene.add(bottom);
  function applyHeights() {
    const p = tgeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, baseM[i] * yS);
    p.needsUpdate = true; tgeo.computeVertexNormals();
    const pos = [], col = [];
    const edge = (list) => {
      for (let k = 0; k < list.length - 1; k++) {
        const a = list[k], b = list[k + 1];
        const ax = p.getX(a), az = p.getZ(a), ay = Math.max(p.getY(a), 0), bx = p.getX(b), bz = p.getZ(b), by = Math.max(p.getY(b), 0);
        pos.push(ax, ay, az, bx, by, bz, ax, FLOOR, az, bx, by, bz, bx, FLOOR, bz, ax, FLOOR, az);
        const top = (y) => (!isCity && y <= 0.001 ? [0.13, 0.33, 0.45] : [0.45, 0.37, 0.26]), bot = [0.07, 0.06, 0.05];
        col.push(...top(ay), ...top(by), ...bot, ...top(by), ...bot, ...bot);
      }
    };
    const top = [], bot = [], left = [], right = [];
    for (let c = 0; c < cols; c++) { top.push(c); bot.push((rows - 1) * cols + (cols - 1 - c)); }
    for (let r = 0; r < rows; r++) { right.push(r * cols + cols - 1); left.push((rows - 1 - r) * cols); }
    edge(top); edge(right); edge(bot); edge(left);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); skirt.geometry.dispose(); skirt.geometry = g;
  }
  applyHeights();

  /* ---------- 바다 ---------- */
  const normalTex = (() => {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n), hgt = new Float32Array(n * n);
    for (let k = 0; k < 6; k++) { const fx = (k % 3 + 1) * 2, fy = (Math.floor(k / 3) + 1) * 3, ph = k * 1.7; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) hgt[y * n + x] += Math.sin((x * fx + y * fy) / n * Math.PI * 2 + ph) / (k + 1); }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = hgt[y * n + (x + 1) % n] - hgt[y * n + (x - 1 + n) % n], dy = hgt[((y + 1) % n) * n + x] - hgt[((y - 1 + n) % n) * n + x]; const i = (y * n + x) * 4; img.data[i] = 128 + dx * 40; img.data[i + 1] = 128 + dy * 40; img.data[i + 2] = 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 24); return t;
  })();
  if (!isCity) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(WW, HH).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      color: 0x2f8db8, transparent: true, opacity: 0.32, alphaMap: seamask, roughness: 0.22, metalness: 0.05,
      normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false, envMapIntensity: 0.9 }));
    water.position.y = 0.004; water.renderOrder = 1; scene.add(water);
  }

  /* ---------- 정치 지도 겹치기 ---------- */
  let polity = null;
  if (opt.polity) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = Math.round(2048 * HH / WW);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    polity = new THREE.Mesh(tgeo, mat); polity.visible = false; polity.renderOrder = 2; scene.add(polity);
    const g = c.getContext('2d');
    const px = (la, lo) => [(lo - meta.lon0) / (meta.lon1 - meta.lon0) * c.width, (meta.lat1 - la) / (meta.lat1 - meta.lat0) * c.height];
    g.clearRect(0, 0, c.width, c.height);
    opt.polity.regions.forEach((r) => {
      g.beginPath(); r.poly.forEach(([la, lo], k) => { const [x, y] = px(la, lo); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = r.color + '55'; g.fill();
      g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeStyle = r.color + 'ee'; g.stroke();
    });
    tex.needsUpdate = true;
  }

  /* ---------- 지도별 3D 장식 ---------- */
  const decor = new THREE.Group(); scene.add(decor);
  const ctx = { THREE, X, Z, yAt, meters, mU, U, get yS() { return yS; }, K, routes, decor, isCity, places };
  const buildDecor = () => { decor.clear(); opt.decor?.(ctx); };
  buildDecor();

  /* ---------- 여정 선 ---------- */
  const lineMats = [];
  const mkMat = (o) => { const m = new LineMaterial({ worldUnits: false, transparent: true, ...o }); lineMats.push(m); return m; };
  const stepKm = isCity ? 0.008 : 4;
  const densify = (pts) => {
    const out = [pts[0]];
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(kmBetween(a, b) / stepKm)); for (let t = 1; t <= n; t++) out.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]); }
    return out;
  };
  const LIFT = isCity ? 0.09 : 0.07;
  const J3 = {};
  journeys.forEach((j) => {
    const legs = (routes[j.id] || []).map((l) => ({ ...l, ll: densify(l.pts) }));
    const col = new THREE.Color(j.color);
    legs.forEach((l) => {
      const sea = l.mode === 'sea', alt = l.mode === 'alt';
      const dash = sea || alt;
      const ds = isCity ? 0.35 : 0.55;
      l.base = new Line2(new LineGeometry(), mkMat({ color: alt ? 0xd8d2c4 : col, linewidth: alt ? 2.2 : sea ? 2.4 : 3.2, dashed: dash, dashSize: ds, gapSize: ds * .7, opacity: 1 }));
      l.halo = new Line2(new LineGeometry(), mkMat({ color: alt ? 0x000000 : 0x2a1d10, linewidth: alt ? 4 : 6.2, opacity: 0.3 }));
      l.prog = new Line2(new LineGeometry(), mkMat({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.15), linewidth: sea ? 3.6 : 5, dashed: sea, dashSize: ds, gapSize: ds * .7, opacity: 1 }));
      l.halo.renderOrder = 3; l.base.renderOrder = 4; l.prog.renderOrder = 5;
      scene.add(l.halo, l.base, l.prog);
    });
    const tracks = {};
    legs.filter((l) => l.mode !== 'alt').forEach((l) => {
      const t = tracks[l.stop] ||= { ll: [], mode: [], cum: [0], total: 0 };
      l.ll.forEach((p, k) => {
        if (t.ll.length && k === 0) return;
        if (t.ll.length) { t.total += kmBetween(t.ll[t.ll.length - 1], p); t.cum.push(t.total); t.mode.push(l.mode); }
        t.ll.push(p);
      });
    });
    J3[j.id] = { legs, tracks };
  });
  function rebuildLines() {
    Object.values(J3).forEach(({ legs }) => legs.forEach((l) => {
      const arr = []; l.ll.forEach(([la, lo]) => arr.push(X(lo), (l.mode === 'sea' ? 0 : yAt(la, lo)) + LIFT, Z(la)));
      [l.base, l.halo, l.prog].forEach((ln) => { ln.geometry.dispose(); ln.geometry = new LineGeometry(); ln.geometry.setPositions(arr); ln.computeLineDistances(); });
      l.segs = l.ll.length - 1;
    }));
  }
  rebuildLines();

  /* ---------- 여행자 · 표지 ---------- */
  const traveler = new THREE.Group(); traveler.visible = false; scene.add(traveler);
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xe5b96f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8b08a, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4527, roughness: 0.8 });
  const walker = new THREE.Group(); traveler.add(walker);
  { const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.05, 14), robeMat); robe.position.y = 0.52; walker.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin); head.position.y = 1.15; walker.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, 1.6), robeMat); hood.position.y = 1.18; hood.rotation.x = -0.35; walker.add(hood);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), wood); staff.position.set(0.32, 0.72, 0.1); staff.rotation.z = -0.12; walker.add(staff); }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const tGlow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd28a }));
  tGlow.position.y = 0.05; traveler.add(tGlow);
  const beacon = new THREE.Group(); beacon.visible = false; scene.add(beacon);
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'); const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.85)'); g.fillStyle = r; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xffd28a });
  beacon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6, 20, 1, true).translate(0, 3, 0), beamMat));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48).rotateX(-Math.PI / 2), ringMat); beacon.add(ring);
  const bGlow = tGlow.clone(); bGlow.material = tGlow.material.clone(); beacon.add(bGlow);

  /* ---------- 이름표 ---------- */
  const L = [];
  const addEl = (cls, html, click) => { const el = document.createElement(click ? 'button' : 'div'); el.className = 'lb ' + cls; if (click) { el.type = 'button'; el.addEventListener('click', click); } el.innerHTML = html; labelsEl.appendChild(el); return el; };
  Object.entries(places).forEach(([id, p]) => {
    const el = addEl(`city r${p.rank}${p.region ? ' regionStop' : ''}`, `<span class="dot"></span><span class="no"></span><span><span class="nm">${p.ko}</span><span class="md">${p.modern}</span></span>`, () => opt.onPlace?.(id));
    L.push({ kind: 'city', id, p, el, lat: p.lat, lon: p.lon, lift: 0.1, regionStop: !!p.region });
  });
  labels.forEach((r) => {
    const el = addEl(r.kind === 'region' ? 'region' : 'sea' + (r.kind === 'water' ? ' water' : ''), r.ko);
    L.push({ kind: r.kind === 'region' ? 'region' : 'sea', el, lat: r.lat, lon: r.lon, lift: 0.5 });
  });
  if (opt.polity) opt.polity.regions.forEach((r) => {
    const c = r.poly.reduce((a, p) => [a[0] + p[0] / r.poly.length, a[1] + p[1] / r.poly.length], [0, 0]);
    const el = addEl('polity', `<b>${r.name}</b><small></small>`); el.style.setProperty('--c', r.color);
    L.push({ kind: 'polity', el, r, lat: c[0], lon: c[1], lift: 0.6 });
  });
  pins.forEach((p, k) => {
    const el = addEl(`pin ${p.cat}`, `<i>${PIN_ICON[p.cat] || '•'}</i><span>${p.title}</span>`, () => opt.onPin?.(p));
    L.push({ kind: 'pin', el, pin: p, lat: p.lat, lon: p.lon, lift: 0.15 });
  });
  function relabel() {
    const j = S.jid ? JM[S.jid] : null;
    const order = {}; if (j) j.stops.forEach((s, i) => { (order[s.to] ||= []).push(i); });
    L.forEach((l) => {
      if (l.kind === 'polity') l.el.querySelector('small').textContent = l.r[S.era] || '';
      if (l.kind !== 'city') return;
      const idx = order[l.id];
      l.inJ = !!idx; l.cur = !!idx && idx.includes(S.stop);
      l.pass = !!idx && idx.every((i) => j.stops[i].pass);
      l.el.classList.toggle('stop', l.inJ); l.el.classList.toggle('cur', l.cur); l.el.classList.toggle('dim', !!j && !l.inJ);
      l.el.style.setProperty('--c', j ? j.color : '#e5b96f');
      const nums = idx ? (idx.includes(S.stop) ? [S.stop] : idx).map((i) => i + 1) : [];
      l.el.querySelector('.no').textContent = nums.slice(0, 3).join('·');
    });
    requestAnimationFrame(() => L.forEach((l) => { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }));
  }
  const tmp = new THREE.Vector3();
  function placeLabels(dist) {
    const w = host.clientWidth, h = host.clientHeight, placed = [], cand = [];
    L.forEach((l) => {
      let pr = -1;
      if (l.kind === 'city') {
        if (l.regionStop) pr = l.inJ ? (l.cur ? 1000 : 300) : -1;
        else if (l.cur) pr = 1000;
        else if (l.inJ) pr = l.pass ? (dist < 160 ? 320 : -1) : 600;
        else if (S.jid) pr = (l.p.rank === 1 && dist < 170) ? 150 : (l.p.rank === 2 && dist < 70) ? 90 : (l.p.rank === 3 && dist < 25) ? 60 : -1;
        else pr = l.p.rank === 1 ? 250 : l.p.rank === 2 ? (dist < 200 ? 180 : -1) : (dist < 90 ? 100 : -1);
      } else if (l.kind === 'region') pr = (S.regions && !S.politics && dist > (isCity ? 8 : 22) && dist < 330) ? 60 : -1;
      else if (l.kind === 'sea') pr = dist > (isCity ? 10 : 30) ? 40 : -1;
      else if (l.kind === 'polity') pr = S.politics ? 700 : -1;
      else if (l.kind === 'pin') pr = S.pins ? 450 : -1;
      if (pr < 0) { l.el.style.display = 'none'; return; }
      tmp.set(X(l.lon), (l.kind === 'city' || l.kind === 'pin' ? yAt(l.lat, l.lon) : Math.max(0, yAt(l.lat, l.lon))) + l.lift, Z(l.lat)).project(camera);
      if (tmp.z > 1 || tmp.x < -1.1 || tmp.x > 1.1 || tmp.y < -1.1 || tmp.y > 1.1) { l.el.style.display = 'none'; return; }
      cand.push({ l, pr, x: (tmp.x * .5 + .5) * w, y: (-tmp.y * .5 + .5) * h });
    });
    cand.sort((a, b) => b.pr - a.pr);
    cand.forEach((c) => {
      const lw = c.l.w || 60, lh = c.l.h || 18;
      const left = c.l.kind === 'city' || c.l.kind === 'pin';
      const r = left ? [c.x - 10, c.y - lh / 2 - 2, c.x - 8 + lw + 4, c.y + lh / 2 + 2] : [c.x - lw / 2 - 6, c.y - lh / 2, c.x + lw / 2 + 6, c.y + lh / 2];
      if (c.pr < 1000 && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) { c.l.el.style.display = 'none'; return; }
      placed.push(r);
      c.l.el.style.display = '';
      c.l.el.style.transform = left ? `translate(${c.x - (c.l.kind === 'pin' ? 13 : 6)}px,${c.y}px) translateY(-50%)` : `translate(${c.x}px,${c.y}px) translate(-50%,-50%)`;
    });
  }

  /* ---------- 카메라 ---------- */
  let tween = null;
  const sph = new THREE.Spherical();
  const currentSph = () => { sph.setFromVector3(camera.position.clone().sub(controls.target)); return { r: sph.radius, phi: sph.phi, th: sph.theta }; };
  function flyTo(target, r, phi, th, dur = 1.6) {
    const c = currentSph();
    if (!S.view3d) phi = 0.001;
    if (th === undefined) th = c.th;
    let dth = th - c.th; while (dth > Math.PI) dth -= Math.PI * 2; while (dth < -Math.PI) dth += Math.PI * 2;
    tween = { t0: controls.target.clone(), t1: target.clone(), r0: c.r, r1: r, p0: c.phi, p1: phi, h0: c.th, h1: c.th + dth, k: 0, dur };
  }
  function stepTween(dt) {
    if (!tween) return false;
    tween.k = Math.min(1, tween.k + dt / tween.dur);
    const e = tween.k < .5 ? 4 * tween.k ** 3 : 1 - (-2 * tween.k + 2) ** 3 / 2;
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    const r = Math.exp(Math.log(tween.r0) + (Math.log(tween.r1) - Math.log(tween.r0)) * e);
    const hop = Math.sin(Math.PI * e) * Math.min(1, tween.t0.distanceTo(tween.t1) / 60) * 0.5;
    sph.set(r * (1 + hop), tween.p0 + (tween.p1 - tween.p0) * e, tween.h0 + (tween.h1 - tween.h0) * e);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); camera.lookAt(controls.target);
    if (tween.k >= 1) tween = null;
    return true;
  }
  function fitBox(points, tilt = 0.66, th = 0) {
    const b = new THREE.Box3(); points.forEach((p) => b.expandByPoint(p));
    const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3());
    const aspect = host.clientWidth / Math.max(1, host.clientHeight), vf = 2 * Math.tan(camera.fov * Math.PI / 360);
    const need = Math.max(sz.z * 1.3 / vf, sz.x * 1.2 / (vf * aspect), isCity ? 6 : 14);
    c.y = isCity ? yAt(latMid, lonMid) * 0.6 : 0;
    flyTo(c, Math.min(300, need * (host.clientWidth < 700 ? 1.3 : 1) + 4), S.view3d ? tilt : 0.001, th);
  }
  function fitJourney(jid) {
    const pts = [];
    if (!jid) journeys.forEach((j) => J3[j.id].legs.forEach((l) => l.ll.forEach(([la, lo], k) => { if (k % 6 === 0) pts.push(new THREE.Vector3(X(lo), 0, Z(la))); })));
    else {
      J3[jid].legs.forEach((l) => l.ll.forEach(([la, lo], k) => { if (k % 4 === 0) pts.push(new THREE.Vector3(X(lo), 0, Z(la))); }));
      JM[jid].stops.forEach((s) => pts.push(new THREE.Vector3(X(places[s.to].lon), 0, Z(places[s.to].lat))));
    }
    if (pts.length < 2) { const p = places[JM[jid].stops[0].to]; pts.push(new THREE.Vector3(X(p.lon) - 4, 0, Z(p.lat) - 3), new THREE.Vector3(X(p.lon) + 4, 0, Z(p.lat) + 3)); }
    fitBox(pts, isCity ? 0.82 : 0.66, isCity ? -0.25 : 0);
  }

  /* ---------- 여정 상태 ---------- */
  const P = { mode: 'idle', track: null, d: 0, dwell: 0, target: 0 };
  function setLines() {
    Object.entries(J3).forEach(([jid, { legs }]) => legs.forEach((l) => {
      const alt = l.mode === 'alt';
      if (!S.jid) { l.base.visible = l.halo.visible = !alt; l.prog.visible = false; l.base.material.opacity = 0.95; l.halo.material.opacity = 0.25; }
      else if (jid === S.jid) { l.base.visible = l.halo.visible = true; l.base.material.opacity = alt ? 0.9 : 0.7; l.halo.material.opacity = alt ? 0.35 : 0.22; }
      else { l.base.visible = !alt; l.halo.visible = false; l.prog.visible = false; l.base.material.opacity = isCity ? 0.0 : 0.13; l.base.visible = !isCity && !alt; }
    }));
    updateProgress();
  }
  function updateProgress() {
    if (!S.jid) return;
    const moving = P.mode === 'moving' || P.mode === 'paused' ? P.target : -1;
    let partial = P.d;
    J3[S.jid].legs.forEach((l) => {
      if (l.mode === 'alt') { l.prog.visible = false; return; }
      let n = 0;
      if (l.stop <= S.stop) n = l.segs;
      else if (l.stop === moving) { const done = Math.max(0, Math.min(l.km, partial)); partial -= l.km; n = Math.round(done / Math.max(l.km, 1e-6) * l.segs); }
      l.prog.geometry.instanceCount = n; l.prog.visible = n > 0;
    });
  }
  function posOnTrack(t, d) {
    let k = 1; while (k < t.cum.length - 1 && t.cum[k] < d) k++;
    const a = t.ll[k - 1], b = t.ll[k], seg = t.cum[k] - t.cum[k - 1] || 1, f = Math.max(0, Math.min(1, (d - t.cum[k - 1]) / seg));
    const la = a[0] + (b[0] - a[0]) * f, lo = a[1] + (b[1] - a[1]) * f;
    return { pos: new THREE.Vector3(X(lo), yAt(la, lo) + 0.02, Z(la)), dir: new THREE.Vector3(X(b[1]) - X(a[1]), 0, Z(b[0]) - Z(a[0])).normalize() };
  }
  function placeTravelerAtStop(i) {
    const p = places[JM[S.jid].stops[i].to];
    traveler.position.set(X(p.lon), yAt(p.lat, p.lon) + 0.02, Z(p.lat));
  }
  function setBeacon(i) {
    const j = JM[S.jid]; if (!j) { beacon.visible = false; return; }
    const p = places[j.stops[i].to];
    beacon.visible = true; beacon.position.set(X(p.lon), yAt(p.lat, p.lon), Z(p.lat));
    const c = new THREE.Color(j.color); beamMat.color.copy(c); ringMat.color.copy(c); bGlow.material.color.copy(c); robeMat.color.copy(c);
  }
  const P3 = (p) => new THREE.Vector3(X(p.lon), yAt(p.lat, p.lon), Z(p.lat));

  const api = {
    setJourney(jid, stop = 0, flyStop = false) {
      P.mode = 'idle'; S.jid = jid; S.stop = stop; setLines(); relabel();
      if (!jid) { traveler.visible = false; beacon.visible = false; fitJourney(null); return; }
      traveler.visible = true; placeTravelerAtStop(stop); setBeacon(stop); updateProgress();
      if (flyStop) api.arriveAt(stop, true); else fitJourney(jid);
    },
    arriveAt(i, fly) {
      S.stop = i; P.mode = 'idle'; P.d = 0;
      placeTravelerAtStop(i); setBeacon(i); updateProgress(); relabel();
      if (fly) {
        const st = JM[S.jid].stops, p = places[st[i].to], prev = i > 0 ? places[st[i - 1].to] : p;
        const span = Math.hypot(X(p.lon) - X(prev.lon), Z(p.lat) - Z(prev.lat));
        flyTo(P3(p), Math.max(isCity ? 14 : 22, Math.min(95, span * 1.3 + (isCity ? 12 : 18))), 0.88);
      }
    },
    play() { if (!S.jid) return; if (P.mode === 'paused') { P.mode = 'moving'; return; } startLeg(); },
    pause() { P.mode = P.mode === 'moving' ? 'paused' : 'idle'; },
    progress() { return P.mode === 'moving' || P.mode === 'paused' ? Math.min(0.999, P.d / (P.track?.total || 1)) : 0; },
    setExag(n) { yS = mU * map.exag[n]; applyHeights(); rebuildLines(); buildDecor(); updateProgress(); if (S.jid) { placeTravelerAtStop(S.stop); setBeacon(S.stop); } },
    setView3d(on) { controls.maxPolarAngle = on ? 1.25 : 0.001; const c = currentSph(); flyTo(controls.target.clone(), c.r, on ? 0.8 : 0.001, c.th, 1.0); },
    fit() { fitJourney(S.jid); },
    focus(lat, lon, r = 20) { flyTo(new THREE.Vector3(X(lon), yAt(lat, lon), Z(lat)), r, 0.95); },
    focusPlace(pid, r) { const p = places[pid]; relabel(); api.focus(p.lat, p.lon, r || (isCity ? 16 : 26)); },
    setLayer() { if (polity) polity.visible = !!S.politics; relabel(); },
    relabel,
    start() { running = true; renderer.setAnimationLoop(loop); resize(); },
    stop() { running = false; renderer.setAnimationLoop(null); }
  };
  function startLeg() {
    const j = JM[S.jid];
    if (S.stop >= j.stops.length - 1) { opt.onEnd?.(); return; }
    const t = J3[S.jid].tracks[S.stop + 1];
    if (!t) { api.arriveAt(S.stop + 1, false); opt.onArrive?.(S.stop); P.mode = 'dwell'; P.dwell = 2.5 / S.speed; return; }
    P.track = t; P.d = 0; P.target = S.stop + 1; P.mode = 'moving';
    const spanU = t.total * U;                  // 화면 단위 거리로 속도를 정함
    P.dur = 2.4 + Math.min(6, spanU / 40);
    flyTo(posOnTrack(t, 0).pos, Math.min(110, Math.max(isCity ? 14 : 28, spanU * 0.9 + (isCity ? 10 : 16))), 0.9, undefined, 1.1);
  }

  /* ---------- 루프 ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(w, h));
  }
  new ResizeObserver(resize).observe(host); resize();
  relabel(); document.fonts?.ready.then(relabel);
  const clock = new THREE.Clock(); let lastProg = 0, running = false;
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    if (P.mode === 'moving') {
      P.d += dt * S.speed * P.track.total / P.dur;
      const done = P.d >= P.track.total;
      const q = posOnTrack(P.track, Math.min(P.d, P.track.total));
      traveler.position.copy(q.pos); traveler.rotation.y = Math.atan2(-q.dir.z, q.dir.x);
      if (!tween) controls.target.lerp(q.pos, 1 - Math.exp(-dt * 3));
      updateProgress();
      if (done) { api.arriveAt(P.target, false); opt.onArrive?.(S.stop); P.mode = 'dwell'; P.dwell = (JM[S.jid].stops[S.stop].pass ? 1.4 : 3.4) / S.speed; }
    } else if (P.mode === 'dwell') {
      P.dwell -= dt;
      if (P.dwell <= 0) { if (S.stop >= JM[S.jid].stops.length - 1) { P.mode = 'idle'; opt.onEnd?.(); } else startLeg(); }
    }
    if (performance.now() - lastProg > 120) { lastProg = performance.now(); opt.onProgress?.(); }
    if (!stepTween(dt)) controls.update();
    controls.target.x = Math.max(-WW / 2, Math.min(WW / 2, controls.target.x));
    controls.target.z = Math.max(-HH / 2, Math.min(HH / 2, controls.target.z));
    const dist = camera.position.distanceTo(controls.target);
    traveler.scale.setScalar(Math.max(isCity ? 0.06 : 0.12, Math.min(3.2, dist * 0.016)));
    walker.position.y = P.mode === 'moving' ? Math.abs(Math.sin(t * 9)) * 0.08 : 0;
    const bs = Math.max(isCity ? 0.1 : 0.25, Math.min(4, dist * 0.02)); beacon.scale.set(bs, bs * 0.8, bs);
    const pulse = (t * 0.7) % 1; ring.scale.setScalar(1 + pulse * 1.6); ringMat.opacity = 0.8 * (1 - pulse);
    opt.onFrame?.(ctx, dist, t);
    normalTex.offset.x = t * 0.006; normalTex.offset.y = t * 0.004;
    renderer.render(scene, camera);
    placeLabels(dist);
  }
  camera.position.set(0, 210, 175); controls.update();
  api.start();
  return api;
}
