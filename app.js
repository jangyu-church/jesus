import { MAPS, PLACES, JOURNEYS, LABELS, POLITY, COINS, PRICES, RULERS, LIFE, PINS } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const JMAP = Object.fromEntries(JOURNEYS.map((j) => [j.id, j]));
const TAG = { text: '본문', arch: '고고학', trad: '전승', model: '학설', debate: '논쟁' };
const PINCAT = { economy: '💰 경제', politics: '👑 정치', life: '🏠 생활' };

/* =========================================================
   상태 — 지도마다 따로
   ========================================================= */
const mkS = () => ({ jid: null, stop: 0, playing: false, speed: 1, exag: 2, view3d: true, modern: false, regions: true, pins: false, politics: false, era: 'bc4' });
const ST = { land: mkS(), jeru: mkS() };
let mode = 'land';                  // land | jeru | life
let lastMap = 'land';
const S = () => ST[mode === 'life' ? lastMap : mode];
const curMap = () => (mode === 'life' ? lastMap : mode);
let ROUTES = null;
const ENG = {};                     // 지도별 엔진
const engine = () => ENG[curMap()];

const fmtDist = (km) => km >= 2 ? '약 ' + (km >= 50 ? Math.round(km / 10) * 10 : Math.round(km)).toLocaleString('ko-KR') + 'km' : '약 ' + (Math.round(km * 1000 / 10) * 10).toLocaleString('ko-KR') + 'm';
const legKm = (j, si) => ROUTES ? ROUTES[j.id].filter((l) => l.stop === si && l.mode !== 'alt').reduce((a, l) => a + l.km, 0) : 0;
const totalKm = (j) => ROUTES ? ROUTES[j.id].filter((l) => l.mode !== 'alt').reduce((a, l) => a + l.km, 0) : 0;
const journeysOf = (m) => JOURNEYS.filter((j) => j.map === m);
const BOOK = { 마: 'mat', 막: 'mrk', 눅: 'luk', 요: 'jhn', 행: 'act', 출: 'exo', 레: 'lev', 민: 'num', 신: 'deu', 사: 'isa', 렘: 'jer', 슥: 'zec', 호: 'hos', 시: 'psa', 히: 'heb' };
function bibleLink(ref) {
  const m = String(ref).match(/(마|막|눅|요|행|출|레|민|신|사|렘|슥|호|시|히)\s*(\d+)/);
  return m ? `https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=${BOOK[m[1]]}&chap=${m[2]}&sec=1` : null;
}

/* =========================================================
   화면 그리기
   ========================================================= */
function renderModes() {
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  ['land', 'jeru'].forEach((m) => { $('#host-' + m).hidden = curMap() !== m; });
  $('#life').hidden = mode !== 'life';
  document.body.dataset.mode = mode; document.body.dataset.map = curMap();
  $('#polityBox').style.display = curMap() === 'land' ? '' : 'none';
}
function renderTabs() {
  const m = curMap(), s = S();
  const all = { id: '', short: '전체', color: '#e5b96f' };
  $('#tabs').innerHTML = [all, ...journeysOf(m)].map((j) =>
    `<button class="tab${(s.jid || '') === j.id && mode !== 'life' ? ' active' : ''}" data-j="${j.id}" style="--c:${j.color}"><i></i>${esc(j.short)}</button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach((b) => b.onclick = () => { if (mode === 'life') setMode(curMap()); selectJourney(b.dataset.j || null); });
  $('#tabs .active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
function renderLegend() {
  const s = S(), j = s.jid && JMAP[s.jid];
  const line = (dash, c) => `<svg width="34" height="8"><line x1="2" y1="4" x2="32" y2="4" stroke="${c}" stroke-width="3.2" stroke-linecap="round" ${dash ? 'stroke-dasharray="5 5"' : ''}/></svg>`;
  const hasAlt = j && ROUTES && ROUTES[j.id].some((l) => l.mode === 'alt');
  $('#legend').innerHTML = `<div>${line(false, j ? j.color : '#e8e2d2')}걸어간 길</div>` + (hasAlt ? `<div>${line(true, '#d8d2c4')}다른 가능 경로</div>` : '') +
    (!j ? journeysOf(curMap()).map((x) => `<div><svg width="34" height="8"><line x1="2" y1="4" x2="32" y2="4" stroke="${x.color}" stroke-width="4" stroke-linecap="round"/></svg>${esc(x.name)}</div>`).join('') : '');
}
function renderHead() {
  renderLegend();
  const m = curMap(), s = S(), j = s.jid && JMAP[s.jid];
  document.documentElement.style.setProperty('--j', j ? j.color : '#e5b96f');
  if (!j) {
    const isLand = m === 'land';
    $('#mapTitle').innerHTML = isLand
      ? `<span class="eyebrow">MATTHEW 1–2 · LUKE 1–2</span><h1>탄생과 어린 시절</h1><p>갈릴리에서 이집트까지 · 실제 지형 위의 여정</p>`
      : `<span class="eyebrow">THE LAST WEEK · AD 30/33</span><h1>마지막 일주일</h1><p>주후 30년 무렵 예루살렘 3D 복원 · 요일별 동선</p>`;
    $('#journeyHead').innerHTML = isLand
      ? `<div class="jNo">THE WAY OF JESUS</div><h2>베들레헴에서 예루살렘까지</h2>
         <p class="jSum">헤롯 왕과 로마 황제가 다스리던 땅에서, 갈릴리 장인의 가정에 태어난 아기가 자라 예루살렘으로 올라가기까지의 길입니다. 아래에서 여정을 고르거나 <b>▶ 따라가기</b>를 누르세요. <b>정치 지도</b>와 <b>사회상 핀</b>을 켜면 그 시대의 권력 구조와 삶이 함께 보입니다.</p>`
      : `<div class="jNo">JERUSALEM · PASSOVER</div><h2>베다니에서 골고다까지</h2>
         <p class="jSum">유월절을 앞둔 예루살렘은 순례객으로 가득했고, 로마 총독과 대제사장 가문의 긴장도 가장 높았습니다. 성 밖 베다니와 성전산을 오가던 날들이 목요일 밤부터 ‘사법의 길’로 바뀝니다. 요일을 고르거나 <b>▶ 따라가기</b>를 누르세요.</p>`;
    $('#stopDetail').innerHTML = '';
    $('#stopList').innerHTML = `<div class="jCards">${journeysOf(m).map((x) => `
      <button class="jCard" data-j="${x.id}" style="--c:${x.color}"><div class="h"><b>${esc(x.name)}</b><small>${esc(x.ref)}</small></div>
      <p>${esc(x.summary)}</p><div class="k"><span>${esc(x.years)}</span>${ROUTES && totalKm(x) ? `<span>${fmtDist(totalKm(x))}</span>` : ''}<span>${x.stops.length}곳</span></div></button>`).join('')}</div>`;
    $('#stopList').querySelectorAll('.jCard').forEach((b) => b.onclick = () => selectJourney(b.dataset.j));
    updateTrack(); return;
  }
  $('#mapTitle').innerHTML = `<span class="eyebrow">${esc(j.group === 'week' ? 'HOLY WEEK · ' + j.no : 'JOURNEY ' + j.no)}</span><h1>${esc(j.name)}</h1><p>${esc(j.ref)}</p>`;
  $('#journeyHead').innerHTML = `
    <div class="jNo">${j.group === 'week' ? 'HOLY WEEK' : 'JOURNEY ' + j.no}</div>
    <h2>${esc(j.name)}</h2>
    <div class="jMeta"><span>본문 <b>${esc(j.ref)}</b></span><span>때 <b>${esc(j.years)}</b></span></div>
    <p class="jSum">${esc(j.summary)}</p>
    <div class="stats"><div><b>${ROUTES && totalKm(j) ? fmtDist(totalKm(j)).replace('약 ', '') : '—'}</b><small>지도상 거리(약)</small></div><div><b>${j.stops.length}곳</b><small>장소</small></div><div><b>${j.stops.reduce((a, s) => a + (s.tags || []).filter((t) => t[0] === 'arch').length, 0)}건</b><small>고고학 자료</small></div></div>
    <div class="word"><span class="cap">원어 한 단어 · ${esc(j.word.ref)}</span><span class="gr">${esc(j.word.gr)}</span><span class="rd">${esc(j.word.read)}</span><br><span class="mn">${esc(j.word.mean)}</span><p>${esc(j.word.body)}</p></div>`;
  $('#stopList').innerHTML = `<div class="lh"><span>장소와 사건</span><span>${j.stops.length}곳</span></div>` + j.stops.map((s, i) =>
    `<button class="st${s.pass ? ' pass' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span class="t"><b>${esc(PLACES[s.to].ko)}</b><small>${esc(s.title)} · ${esc(s.ref)}</small></span></button>`).join('');
  $('#stopList').querySelectorAll('.st').forEach((b) => b.onclick = () => { stopPlay(); goStop(+b.dataset.i, true); });
  renderStop();
}
function renderStop() {
  const s = S(); if (!s.jid) return;
  const j = JMAP[s.jid], st = j.stops[s.stop], p = PLACES[st.to];
  const km = s.stop > 0 ? legKm(j, s.stop) : 0;
  const move = s.stop === 0 ? '출발' : `${esc(PLACES[j.stops[s.stop - 1].to].ko)}에서 ${km ? fmtDist(km) : ''} · 🚶 걸어서`;
  const link = bibleLink(st.ref);
  $('#stopDetail').innerHTML = `
    <div class="sTop"><div class="sNo">${s.stop + 1}</div>
      <div class="sName"><h3>${esc(p.ko)}${p.orig ? `<span class="gr">${esc(p.orig)}</span>` : ''}</h3><div class="md">오늘날 · ${esc(p.modern)}</div></div></div>
    <div class="sMove">${move}</div>
    <div class="sTitle">${esc(st.title)}</div>
    <p class="body">${esc(st.body)}</p>
    ${st.note ? `<div class="note">${esc(st.note)}</div>` : ''}
    ${st.alt ? `<div class="altNote"><svg width="30" height="8"><line x1="2" y1="4" x2="28" y2="4" stroke="#d8d2c4" stroke-width="3" stroke-dasharray="5 5"/></svg>회색 점선: ${esc(st.alt.label)}</div>` : ''}
    ${st.tags ? `<div class="tags">${st.tags.map(([k, t]) => `<span class="tag ${k}">${TAG[k]} · ${esc(t)}</span>`).join('')}</div>` : ''}
    ${link ? `<a class="refLink" href="${link}" target="_blank" rel="noopener">📖 ${esc(st.ref)} 읽기 (개역개정) ↗</a>` : ''}`;
  document.querySelectorAll('#stopList .st').forEach((b, i) => { b.classList.toggle('cur', i === s.stop); b.classList.toggle('done', i < s.stop); });
  if (matchMedia('(min-width:821px)').matches) $('#panel').scrollTo({ top: $('#stopDetail').offsetTop - 8, behavior: 'smooth' });
  updateTrack();
}
function showPin(pin) {
  $('#stopDetail').innerHTML = `<div class="pinCard"><span class="cat ${pin.cat}">${PINCAT[pin.cat]}</span><div class="sTitle" style="margin-top:4px">${esc(pin.title)}</div><p class="body">${esc(pin.body)}</p></div>`;
  $('#panel').scrollTo({ top: $('#stopDetail').offsetTop - 8, behavior: 'smooth' });
}
function updateTrack() {
  const s = S(), ticks = $('#ticks'), fill = $('#trackFill');
  if (!s.jid) { ticks.innerHTML = ''; fill.style.width = '0'; return; }
  const j = JMAP[s.jid], n = j.stops.length, pos = (i) => (n === 1 ? 0 : i / (n - 1) * 100);
  if (ticks.dataset.j !== j.id) { ticks.dataset.j = j.id; ticks.innerHTML = j.stops.map((x, i) => `<i class="${x.pass ? 'pass' : ''}" style="left:${pos(i)}%" title="${esc(PLACES[x.to].ko)}"></i>`).join(''); }
  fill.style.width = pos(s.stop + (engine()?.progress() || 0)) + '%';
  [...ticks.children].forEach((t, i) => { t.classList.toggle('done', i <= s.stop); t.classList.toggle('cur', i === s.stop); });
}

/* ---------- 그때의 삶 ---------- */
let wage = 100000;
try { wage = +localStorage.getItem('jesus-wage') || 100000; } catch {}
function won(den) { const v = den * wage; return v >= 1e8 ? (v / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억 원' : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('ko-KR') + '만 원' : Math.round(v).toLocaleString('ko-KR') + '원'; }
function denStr(d) { return d >= 1 ? d.toLocaleString('ko-KR') + ' 데나리온' : '1/' + Math.round(1 / d) + ' 데나리온'; }
function renderLife() {
  const y0 = -40, y1 = 42, pct = (y) => (y - y0) / (y1 - y0) * 100;
  const ticks = [-40, -30, -20, -10, 1, 10, 20, 30, 40].map((y) => `<span style="left:${pct(y)}%">${y < 0 ? '주전 ' + -y : '주후 ' + y}</span>`).join('');
  const colors = ['#d9a35a', '#d9a35a', '#e4a84e', '#c97b5a', '#6fb06a', '#8fa0d8', '#9cc7ef', '#cf4b3f', '#b9628f', '#b9628f'];
  const marks = [[-5, '탄생 (주전 6–4년)'], [30, '수난 (주후 30/33년)']].map(([y, t]) => `<div class="mark" style="left:${pct(y)}%"><b>${t}</b></div>`).join('');
  const rows = RULERS.map((r, i) => {
    const L0 = pct(r.from), W0 = Math.max(pct(r.to) - pct(r.from), 1.5), txt = `${esc(r.who)} · ${esc(r.role)}`;
    const inside = W0 > 30;
    const lab = inside ? '' : (L0 + W0 > 62 ? `<span class="lab" style="right:${100 - L0 + 0.8}%">${txt}</span>` : `<span class="lab" style="left:${L0 + W0 + 0.8}%">${txt}</span>`);
    return `<div class="row"><div class="bar" style="--c:${colors[i]};left:${L0}%;width:${W0}%" title="${esc(r.role)} · ${esc(r.ref)}">${inside ? txt : ''}</div>${lab}</div>`;
  }).join('');
  const maxLog = Math.log10(6e7), minLog = Math.log10(1 / 128);
  $('#life').innerHTML = `<div class="sec">
    <span class="eyebrow">LIFE IN THE FIRST CENTURY</span>
    <h2>그때의 삶 — 정치 · 경제 · 서민의 하루</h2>
    <p class="lead">복음서의 이야기는 로마 제국과 헤롯 왕가, 성전 귀족이 겹겹이 다스리던 사회에서 일어났습니다. 통치자의 연표, 성경에 나오는 돈과 물가, 그리고 보통 사람들의 집·혼인·밥상을 정리했습니다. 지도 위의 💰👑🏠 핀과 함께 보세요.</p>
    <h3>👑 누가 다스렸나 — 통치자 연표</h3>
    <div class="timeline">${marks}<div class="axis">${ticks}</div>${rows}</div>
    <p class="lead" style="font-size:13.5px;color:var(--muted)">헤롯 사후 왕국이 어떻게 나뉘었는지는 ‘탄생과 어린 시절’ 지도에서 <b>정치 지도</b>를 켜고 ‘주전 4년 / 주후 30년’을 바꿔 보세요.</p>
    <h3>💰 성경 속의 돈과 물가</h3>
    <div class="conv"><label for="wage">오늘의 하루 품삯을</label><input id="wage" type="number" min="10000" step="10000" value="${wage}"><span>원으로 놓고 환산하면</span><small>(1데나리온 = 노동자의 하루 품삯, 마 20:2 · 어림 비교입니다)</small></div>
    <div class="coins">${COINS.map((c) => `<div class="coin${c.den < 1 ? ' copper' : ''}"><div class="c">${esc(c.ko[0])}</div><b>${esc(c.ko)}</b><small>${esc(c.orig)}</small><div class="v">${denStr(c.den)} · ${won(c.den)}</div><small>${esc(c.note)}</small></div>`).join('')}</div>
    <table class="prices"><tbody>${[...PRICES].sort((p, q) => p.den - q.den).map((p) => `<tr><td><b>${esc(p.item)}</b><small>${esc(p.ref)} · ${esc(p.note)}</small><div class="bar" style="width:${Math.max(1, (Math.log10(p.den) - minLog) / (maxLog - minLog) * 100)}%"></div></td><td class="d">${denStr(p.den)}</td><td class="w">${won(p.den)}</td></tr>`).join('')}</tbody></table>
    <p class="lead" style="font-size:13px;color:var(--muted);margin-top:8px">막대는 값의 크기를 로그 눈금으로 비교한 것입니다. 1세기 물가는 지역·시기에 따라 달랐고, 세겔·은 삼십 등의 환산은 학자들의 일반적 추정을 따랐습니다.</p>
    <h3>🏠 보통 사람들의 삶</h3>
    <div class="cards">${LIFE.map((c) => `<div class="lcard"><h4>${c.icon} ${esc(c.title)}</h4><p>${esc(c.body)}</p>${c.note ? `<small>${esc(c.note)}</small>` : ''}</div>`).join('')}</div>
    <h3>📍 지도에서 보기</h3>
    <div class="pinList">${PINS.map((p, i) => `<button data-pin="${i}">${PINCAT[p.cat].split(' ')[0]} ${esc(p.title)}</button>`).join('')}</div>
  </div>`;
  $('#wage').addEventListener('change', (e) => { wage = Math.max(1000, +e.target.value || 100000); try { localStorage.setItem('jesus-wage', wage); } catch {} renderLife(); });
  $('#life').querySelectorAll('[data-pin]').forEach((b) => b.onclick = () => {
    const pin = PINS[+b.dataset.pin];
    setMode(pin.map); ST[pin.map].pins = true; syncToggles(); ENG[pin.map]?.setLayer();
    ENG[pin.map]?.focus(pin.lat, pin.lon, pin.map === 'jeru' ? 14 : 24); showPin(pin);
  });
}

/* =========================================================
   동작
   ========================================================= */
async function setMode(m) {
  stopPlay();
  if (m !== 'life') lastMap = m;
  mode = m; renderModes(); renderTabs(); renderHead(); syncToggles();
  if (m === 'life') { renderLife(); $('#life').scrollTop = 0; return; }
  Object.entries(ENG).forEach(([k, e]) => (k === m ? e.start() : e.stop()));
  if (!ENG[m]) await initEngine(m);
}
function selectJourney(id, stopIdx = 0) {
  stopPlay();
  const s = S(); s.jid = id || null; s.stop = id ? Math.max(0, Math.min(stopIdx, JMAP[id].stops.length - 1)) : 0;
  renderTabs(); renderHead(); $('#panel').scrollTop = 0;
  engine()?.setJourney(s.jid, s.stop, stopIdx > 0);
  updateTrack();
  history.replaceState(null, '', '#' + (id || curMap()));
}
function goStop(i, fly) {
  const s = S(); if (!s.jid) return;
  s.stop = Math.max(0, Math.min(i, JMAP[s.jid].stops.length - 1));
  engine()?.arriveAt(s.stop, fly); renderStop();
}
function stopPlay() { const s = S(); if (!s.playing) return; s.playing = false; engine()?.pause(); renderPlay(); }
function renderPlay() { const s = S(); $('#playBtn span').textContent = s.playing ? '❚❚' : '▶'; $('#playBtn em').textContent = s.playing ? '멈춤' : '따라가기'; }
function syncToggles() {
  const s = S();
  $('#pinBtn').setAttribute('aria-pressed', s.pins); $('#polityBtn').setAttribute('aria-pressed', s.politics); $('#eraBox').hidden = !s.politics;
  document.querySelectorAll('[data-era]').forEach((b) => b.classList.toggle('on', b.dataset.era === s.era));
  document.querySelectorAll('[data-exag]').forEach((b) => b.classList.toggle('on', +b.dataset.exag === s.exag));
  $('#modernBtn').setAttribute('aria-pressed', s.modern); $('#viewBtn').textContent = s.view3d ? '2D' : '3D';
  ['land', 'jeru'].forEach((m) => $(`#host-${m} .labels`).classList.toggle('showModern', ST[m].modern));
  renderPlay();
}
document.querySelectorAll('#modes button').forEach((b) => b.onclick = () => { setMode(b.dataset.mode); history.replaceState(null, '', '#' + b.dataset.mode); });
$('#playBtn').onclick = () => {
  if (mode === 'life') return;
  const s = S();
  if (!s.jid) selectJourney(journeysOf(curMap())[0].id);
  const j = JMAP[s.jid];
  if (!s.playing && s.stop >= j.stops.length - 1) goStop(0, true);
  s.playing = !s.playing; renderPlay();
  if (s.playing) engine()?.play(); else engine()?.pause();
};
$('#prevBtn').onclick = () => { stopPlay(); goStop(S().stop - 1, true); };
$('#nextBtn').onclick = () => { stopPlay(); const s = S(); if (!s.jid) selectJourney(journeysOf(curMap())[0].id); else goStop(s.stop + 1, true); };
$('#speedBtn').onclick = () => { const s = S(); s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 0.5 : 1; $('#speedBtn').textContent = s.speed + '×'; };
$('#track').addEventListener('click', (e) => { const s = S(); if (!s.jid) return; const r = e.currentTarget.getBoundingClientRect(), n = JMAP[s.jid].stops.length; stopPlay(); goStop(Math.round((e.clientX - r.left) / r.width * (n - 1)), true); });
$('#modernBtn').onclick = () => { const s = S(); s.modern = !s.modern; syncToggles(); };
$('#pinBtn').onclick = () => { const s = S(); s.pins = !s.pins; syncToggles(); engine()?.setLayer(); };
$('#polityBtn').onclick = () => { const s = S(); s.politics = !s.politics; syncToggles(); engine()?.setLayer(); if (s.politics) { engine()?.focus(31.7, 34.9, 120); $('#stopDetail').innerHTML = `<div class="pinCard"><span class="cat politics">👑 정치 지도</span><div class="sTitle">${esc(POLITY.eras[s.era].label)}</div><p class="body">${esc(POLITY.eras[s.era].note)}</p></div>`; } };
document.querySelectorAll('[data-era]').forEach((b) => b.onclick = () => { const s = S(); s.era = b.dataset.era; syncToggles(); engine()?.relabel(); $('#stopDetail').innerHTML = `<div class="pinCard"><span class="cat politics">👑 정치 지도</span><div class="sTitle">${esc(POLITY.eras[s.era].label)}</div><p class="body">${esc(POLITY.eras[s.era].note)}</p></div>`; });
document.querySelectorAll('[data-exag]').forEach((b) => b.onclick = () => { S().exag = +b.dataset.exag; syncToggles(); engine()?.setExag(S().exag); });
$('#viewBtn').onclick = () => { const s = S(); s.view3d = !s.view3d; syncToggles(); engine()?.setView3d(s.view3d); };
$('#fitBtn').onclick = () => engine()?.fit();
$('#moreBtn').onclick = () => { const t = $('.tools'); t.classList.toggle('open'); $('#moreBtn').setAttribute('aria-expanded', t.classList.contains('open')); };
addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || mode === 'life') return;
  if (e.code === 'Space') { e.preventDefault(); $('#playBtn').click(); }
  if (e.code === 'ArrowRight') $('#nextBtn').click();
  if (e.code === 'ArrowLeft') $('#prevBtn').click();
});

/* ---------- 대화상자 · 앱 설치 ---------- */
$('#helpBtn').onclick = () => $('#help').showModal();
$('#sourceBtn').onclick = () => $('#sources').showModal();
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let deferredPrompt = null;
const store = { get(k) { try { return localStorage.getItem('jesus-' + k); } catch { return null; } }, set(k, v) { try { localStorage.setItem('jesus-' + k, v); } catch {} } };
function installHTML() {
  if (deferredPrompt) return `<p>아래 단추를 누르면 바로 설치됩니다. 설치 후에는 홈 화면의 <b>예수님의 길</b> 아이콘으로 열 수 있습니다.</p><button class="gold" data-act="prompt">홈 화면에 설치하기</button>`;
  if (inApp) return `<p>지금은 ${/KAKAOTALK/i.test(ua) ? '카카오톡' : '앱'} 안의 화면이라 설치할 수 없습니다.</p><ol><li>오른쪽 아래(또는 위)의 <span class="key">⋮</span> 또는 <span class="key">공유</span>를 누릅니다.</li><li><b>${isIOS ? '“Safari로 열기”' : '“다른 브라우저로 열기”(크롬)'}</b>를 누릅니다.</li><li>열린 화면에서 다시 <b>앱으로 받기</b>를 누릅니다.</li></ol><button class="gold" data-act="copy">주소 복사하기</button><p class="hint2">${esc(location.href.split('#')[0])}</p>`;
  if (isIOS) return `<p>아이폰·아이패드는 <b>사파리</b>에서 설치합니다.</p><ol><li>화면 아래(또는 위)의 <span class="key">공유 ⬆︎</span> 단추를 누릅니다.</li><li>목록을 조금 내려 <b>“홈 화면에 추가”</b>를 누릅니다.</li><li>오른쪽 위 <b>“추가”</b>를 누르면 홈 화면에 아이콘이 생깁니다.</li></ol>`;
  if (isAndroid) return `<p>갤럭시 등 안드로이드 폰은 <b>크롬</b>에서 설치합니다.</p><ol><li>오른쪽 위 <span class="key">⋮</span> 메뉴를 누릅니다.</li><li><b>“홈 화면에 추가”</b> 또는 <b>“앱 설치”</b>를 누릅니다.</li><li><b>“설치”</b>를 누르면 홈 화면에 아이콘이 생깁니다.</li></ol><p class="hint2">삼성 인터넷에서는 아래쪽 <span class="key">≡</span> 메뉴 → <b>“현재 페이지 추가” → “홈 화면”</b>을 누르세요.</p>`;
  return `<p>컴퓨터에서는 <b>크롬</b>이나 <b>엣지</b>에서 설치할 수 있습니다.</p><ol><li>주소창 오른쪽 끝의 <span class="key">설치 ⊕</span> 아이콘을 누릅니다.</li><li>(보이지 않으면) 오른쪽 위 <span class="key">⋮</span> → <b>“저장 및 공유” → “페이지를 앱으로 설치”</b>를 누릅니다.</li></ol>`;
}
const openInstall = () => { $('#installBody').innerHTML = installHTML(); $('#install').showModal(); };
$('#installBody').addEventListener('click', async (e) => {
  const act = e.target.dataset.act;
  if (act === 'prompt' && deferredPrompt) { deferredPrompt.prompt(); const r = await deferredPrompt.userChoice.catch(() => null); deferredPrompt = null; if (r?.outcome === 'accepted') $('#install').close(); else $('#installBody').innerHTML = installHTML(); }
  if (act === 'copy') { try { await navigator.clipboard.writeText(location.href.split('#')[0]); e.target.textContent = '복사했습니다'; } catch { e.target.textContent = '아래 주소를 길게 눌러 복사하세요'; } }
});
function refreshInstallUI() {
  const show = !isStandalone() && window.top === window.self;
  $('#installBtn').hidden = !show;
  $('#installBar').hidden = !(show && (isIOS || isAndroid) && !store.get('barClosed'));
}
$('#installBtn').onclick = openInstall; $('#installBarBtn').onclick = openInstall;
$('#installBarClose').onclick = () => { store.set('barClosed', '1'); $('#installBar').hidden = true; };
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; refreshInstallUI(); });
addEventListener('appinstalled', () => { deferredPrompt = null; store.set('barClosed', '1'); refreshInstallUI(); });
refreshInstallUI();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});

/* =========================================================
   3D 엔진 준비
   ========================================================= */
let EngineMod = null, DecorMod = null;
async function initEngine(m) {
  $('#loading').hidden = false;
  try {
    EngineMod ||= await import('./engine.js');
    DecorMod ||= await import('./decor.js');
    const s = ST[m];
    const places = Object.fromEntries(Object.entries(PLACES).filter(([, p]) => p.map === m));
    const host = $('#host-' + m);
    ENG[m] = await EngineMod.createEngine({
      host: host.querySelector('.scene'), labelsEl: host.querySelector('.labels'), map: MAPS[m], places,
      journeys: journeysOf(m), routes: ROUTES, labels: LABELS[m], pins: PINS.filter((p) => p.map === m),
      polity: m === 'land' ? POLITY : null, S: s,
      decor: m === 'jeru' ? DecorMod.decorJeru : DecorMod.decorLand,
      onFrame: m === 'land' ? (ctx, dist) => { ctx.decor.visible = dist < 46; } : null,
      onArrive: (i) => { s.stop = i; if (curMap() === m) renderStop(); },
      onEnd: () => { s.playing = false; if (curMap() === m) renderPlay(); },
      onProgress: () => { if (curMap() === m && mode !== 'life') updateTrack(); },
      onPlace: (pid) => {
        if (s.jid) { const i = JMAP[s.jid].stops.findIndex((x) => x.to === pid); if (i >= 0) { stopPlay(); goStop(i, true); return; } }
        const hit = journeysOf(m).find((j) => j.stops.some((x) => x.to === pid));
        if (hit) selectJourney(hit.id, hit.stops.findIndex((x) => x.to === pid)); else ENG[m].focusPlace(pid);
      },
      onPin: (pin) => showPin(pin),
      loadText: (t) => { $('#loadText').textContent = t; }
    });
    window.jesusMap = ENG;
    if (curMap() !== m) ENG[m].stop();
    ENG[m].setJourney(s.jid, s.stop);
  } catch (err) {
    console.error(err); $('#error').hidden = false;
  }
  $('#loading').hidden = true;
}

/* ---------- 시작 ---------- */
(async () => {
  try { ROUTES = await fetch('data/routes.json').then((r) => r.json()); } catch { ROUTES = null; }
  const h = location.hash.slice(1);
  const target = JMAP[h] ? JMAP[h].map : (h === 'jeru' || h === 'life' ? h : 'land');
  await setMode(target === 'life' ? 'land' : target);
  if (h === 'life') setMode('life');
  if (JMAP[h]) selectJourney(h);
})();
