#!/usr/bin/env node
// 오프라인 1회 빌드: world-atlas TopoJSON + world-countries + World Bank 인구를 join해
// world.html에 임베드할 `const WORLD = {...}` 페이로드를 생성한다.
//   node tools/build-world-data.mjs
// 산출물: tools/world-data.js, tools/inspect.svg, (world.html 존재 시) 마커 사이에 주입.
// 소스 스냅숏은 tools/cache/에 저장되어 재빌드는 네트워크 없이 동작한다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'cache');
const APP = join(HERE, '..', 'world.html');
mkdirSync(CACHE, { recursive: true });

const fail = m => { console.error('✖ ' + m); process.exit(1); };
const ok = m => console.log('✓ ' + m);

// ---- 0. Intl 한국어 로케일 확인 (full-ICU 필수) ----
const dn = new Intl.DisplayNames(['ko'], { type: 'region' });
if (dn.of('KR') !== '대한민국') fail('node에 한국어 ICU가 없습니다 (Intl.DisplayNames ko 실패)');
ok('Intl.DisplayNames ko 사용 가능');

// ---- 1. 소스 다운로드 (캐시 우선, CDN 폴백) ----
async function fetchCached(name, urls) {
  const p = join(CACHE, name);
  if (existsSync(p)) { ok(`cache hit: ${name}`); return readFileSync(p, 'utf8'); }
  for (const u of urls) {
    try {
      const r = await fetch(u, { redirect: 'follow' });
      if (!r.ok) continue;
      const t = await r.text();
      writeFileSync(p, t);
      ok(`downloaded: ${name} (${t.length.toLocaleString()}B) ← ${u}`);
      return t;
    } catch { /* 다음 폴백 */ }
  }
  fail(`다운로드 실패: ${name}`);
}

const topo = JSON.parse(await fetchCached('countries-110m.json', [
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://unpkg.com/world-atlas@2/countries-110m.json',
]));
const wc = JSON.parse(await fetchCached('world-countries.json', [
  'https://cdn.jsdelivr.net/npm/world-countries@5/countries.json',
  'https://unpkg.com/world-countries@5/countries.json',
]));
const wb = JSON.parse(await fetchCached('worldbank-pop.json', [
  'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrv=1',
]));

const geoms = topo.objects.countries.geometries;
if (geoms.length !== 177) fail(`geometry 수 ${geoms.length} ≠ 177`);
if (!(wb[0].pages === 1 && wb[1].length >= 200)) fail('World Bank 응답 형태가 예상과 다름');
ok(`소스 로드 완료: geometry ${geoms.length}, world-countries ${wc.length}, WB rows ${wb[1].length}`);

// ---- 2. TopoJSON 디코드 ----
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
function ringFromArcs(idxList) {
  const pts = [];
  for (const ai of idxList) {
    let a = ai < 0 ? arcs[~ai].slice().reverse() : arcs[ai];
    if (pts.length) a = a.slice(1);
    pts.push(...a);
  }
  // 닫힘 중복점 제거 → 내부 표현은 열린 링
  if (pts.length > 1) {
    const [f, l] = [pts[0], pts[pts.length - 1]];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  return pts;
}

// ---- 3. 반자오선 분할 ----
const wrapSegs = ring => {
  const w = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.abs(b[0] - a[0]) > 180) w.push(i);
  }
  return w;
};
const shoelace = pts => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};
function clipHalf(pts, inside, cross) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
    const ci = inside(cur), pi = inside(prev);
    if (ci) { if (!pi) out.push(cross(prev, cur)); out.push(cur); }
    else if (pi) out.push(cross(prev, cur));
  }
  return out;
}
const ixAt = L => (a, b) => { const t = (L - a[0]) / (b[0] - a[0]); return [L, a[1] + t * (b[1] - a[1])]; };
function splitRing(ring) {
  const w = wrapSegs(ring);
  if (w.length === 0) return [ring];
  if (w.length === 1) {
    // 극점 포위 링 (남극뿐) — 절단 후 남극점으로 닫는다
    const avgLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    if (avgLat > 0) fail('북극 포위 링? 예상 밖 데이터');
    const k = w[0];
    const open = ring.slice(k + 1).concat(ring.slice(0, k + 1));
    const endLon = open[open.length - 1][0], startLon = open[0][0];
    open.push([endLon, -90], [startLon, -90]);
    return [open];
  }
  // 짝수 wrap: unwrap 후 ±360 시프트 윈도우 클리핑
  const u = [ring[0].slice()];
  let off = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0];
    if (d > 180) off -= 360; else if (d < -180) off += 360;
    u.push([ring[i][0] + off, ring[i][1]]);
  }
  const pieces = [];
  for (const shift of [-360, 0, 360]) {
    let pts = u.map(([x, y]) => [x + shift, y]);
    pts = clipHalf(pts, p => p[0] >= -180, ixAt(-180));
    if (pts.length > 2) pts = clipHalf(pts, p => p[0] <= 180, ixAt(180));
    if (pts.length > 2 && Math.abs(shoelace(pts)) > 1e-8) pieces.push(pts);
  }
  return pieces;
}

// ---- 4. Natural Earth I 투영 (Šavrič 다항 근사) ----
const RAD = Math.PI / 180;
function ne1(lon, lat) {
  const l = lon * RAD, p = lat * RAD, p2 = p * p, p4 = p2 * p2;
  return [
    l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  ];
}
const MW = 960, SC = MW / (2 * 0.8707 * Math.PI), MH = 500;
const proj = ([lon, lat]) => { const [x, y] = ne1(lon, lat); return [x * SC + MW / 2, MH / 2 - y * SC]; };

// ---- 5. geometry → {outerRings(lonlat), holes, arcSet} ----
function polys(g) {
  return g.type === 'Polygon' ? [g.arcs] : g.arcs; // [[ring0, hole...], ...]
}
function arcSetOf(g) {
  const s = new Set();
  for (const poly of polys(g)) for (const ring of poly) for (const ai of ring) s.add(ai < 0 ? ~ai : ai);
  return s;
}
function shapesOf(g) {
  // 반자오선 분할 적용된 lon/lat 링 목록 (outer만 분할 대상 — 구멍은 레소토뿐, wrap 없음)
  const outers = [], holes = [];
  for (const poly of polys(g)) {
    for (const piece of splitRing(ringFromArcs(poly[0]))) outers.push(piece);
    for (let h = 1; h < poly.length; h++) holes.push(ringFromArcs(poly[h]));
  }
  return { outers, holes };
}

// ---- 6. 분할 검증: 최종 링에 wrap 세그먼트 0 (남극 바닥 에지 예외) ----
for (const g of geoms) {
  const { outers, holes } = shapesOf(g);
  for (const r of [...outers, ...holes]) {
    for (const i of wrapSegs(r)) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (!(a[1] <= -89.9 && b[1] <= -89.9)) fail(`잔여 wrap: ${g.properties.name} (${a} → ${b})`);
    }
  }
}
ok('반자오선 분할 후 잔여 wrap 0');

// ---- 7. path/centroid 생성 ----
function pathOf(shapes) {
  let d = '';
  for (const ring of [...shapes.outers, ...shapes.holes]) {
    const pts = [];
    let last = null;
    for (const p of ring) {
      const q = proj(p).map(Math.round);
      if (last && q[0] === last[0] && q[1] === last[1]) continue;
      pts.push(q); last = q;
    }
    if (pts.length < 3) continue;
    d += 'M' + pts.map(p => p[0] + ' ' + p[1]).join('L') + 'Z';
  }
  return d;
}
function centroidOf(shapes) {
  let best = null, bestA = -1;
  for (const ring of shapes.outers) {
    const pr = ring.map(proj);
    const A = Math.abs(shoelace(pr));
    if (A > bestA) { bestA = A; best = { pr, ll: ring }; }
  }
  const cen = pts => {
    const A = shoelace(pts);
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], k = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k;
    }
    return [cx / (6 * A), cy / (6 * A)];
  };
  const [cx, cy] = cen(best.pr), [lon, lat] = cen(best.ll);
  return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), lon: +lon.toFixed(2), lat: +lat.toFixed(2) };
}

// ---- 8. join + 핸드패치 ----
const byCcn3 = new Map(wc.filter(c => c.ccn3).map(c => [c.ccn3, c]));
const popByIso3 = new Map(wb[1].filter(r => r.value != null && r.countryiso3code).map(r => [r.countryiso3code, r.value]));

const MERGE_INTO = { 'N. Cyprus': '196', 'Somaliland': '706' };   // 병합 (name 키)
const NONPLAY = new Set(['010', '238', '260']);                   // 남극, 포클랜드, 프랑스령 남방
const POP_PATCH = { '158': 23400000, '732': 590000, XK: 1576876 }; // 대만, 서사하라, 코소보(WB 폴백)
const NAME_PATCH = {};                                             // 필요 시 최후 보루

const records = [];            // 최종 국가 레코드
const idToRec = new Map();     // topo id → record (병합 대상 찾기용)
const mergePending = [];       // [geometry, targetId]

for (const g of geoms) {
  const name = g.properties.name;
  if (MERGE_INTO[name]) { mergePending.push([g, MERGE_INTO[name]]); continue; }
  const shapes = shapesOf(g);
  const rec = {
    id: g.id ?? (name === 'Kosovo' ? 'XK' : fail(`id 없는 미지의 geometry: ${name}`)),
    play: 1, arcSet: arcSetOf(g), shapes,
    path: pathOf(shapes), ...centroidOf(shapes),
  };
  if (rec.id === 'XK') { rec.cca2 = 'XK'; rec.cca3 = 'XKX'; }
  else {
    const m = byCcn3.get(rec.id);
    if (!m) fail(`world-countries 매칭 실패: ${name} (id=${rec.id})`);
    rec.cca2 = m.cca2; rec.cca3 = m.cca3;
  }
  if (NONPLAY.has(rec.id)) { rec.play = 0; rec.pop = 0; }
  else {
    rec.pop = popByIso3.get(rec.cca3) ?? POP_PATCH[rec.id] ?? POP_PATCH[rec.cca2] ?? 0;
    if (!rec.pop) fail(`인구 없음: ${name} (${rec.cca3})`);
  }
  let ko = NAME_PATCH[rec.id];
  if (!ko) { try { ko = dn.of(rec.cca2); } catch { /* fallthrough */ } }
  if (!ko || ko === rec.cca2) fail(`한국어명 없음: ${name} (${rec.cca2})`);
  rec.nameKo = ko;
  records.push(rec); idToRec.set(String(rec.id), rec);
}
for (const [g, targetId] of mergePending) {
  const t = idToRec.get(targetId);
  if (!t) fail(`병합 대상 없음: ${g.properties.name} → ${targetId}`);
  const shapes = shapesOf(g);
  t.path += pathOf(shapes);
  for (const a of arcSetOf(g)) t.arcSet.add(a);
}
ok(`국가 레코드 ${records.length}개 (플레이 가능 ${records.filter(r => r.play).length})`);

// ---- 9. 육로 인접 (공유 arc) ----
const arcOwners = new Map();
records.forEach((r, i) => { for (const a of r.arcSet) { if (!arcOwners.has(a)) arcOwners.set(a, []); arcOwners.get(a).push(i); } });
records.forEach(r => r.nb = new Set());
for (const owners of arcOwners.values())
  for (let i = 0; i < owners.length; i++)
    for (let j = i + 1; j < owners.length; j++) { records[owners[i]].nb.add(owners[j]); records[owners[j]].nb.add(owners[i]); }
const kr = records.findIndex(r => r.cca2 === 'KR'), kp = records.findIndex(r => r.cca2 === 'KP');
if (!records[kr].nb.has(kp)) fail('인접 검증 실패: 한국↔북한');
ok('육로 인접 계산 완료 (한↔북 검증 통과)');

// ---- 10. 항공 top-12 (중력 모델) ----
const hav = (a, b) => {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
};
const playIdx = records.map((r, i) => r.play ? i : -1).filter(i => i >= 0);
let SW = 0;
const linksOf = new Map();
for (const i of playIdx) {
  const cand = [];
  for (const j of playIdx) {
    if (i === j) continue;
    const d = hav(records[i], records[j]);
    const w = Math.pow(records[i].pop * records[j].pop, 0.4) / (1 + (d / 6000) ** 2);
    cand.push([j, w]);
  }
  cand.sort((a, b) => b[1] - a[1]);
  const top = cand.slice(0, 12);
  linksOf.set(i, top);
  for (const [, w] of top) SW += w;
}
for (const [i, top] of linksOf) records[i].air = top.map(([j, w]) => [j, +((w / SW) * 1e6).toFixed(3)]); // ppm 단위
ok('항공 링크 완료');

// ---- 11. 직렬화 + 주입 ----
const C = records.map(r => [r.id, r.cca2, r.nameKo, r.pop, r.cx, r.cy, r.lon, r.lat, r.play,
  [...r.nb], r.air ?? [], r.path]);
const payload = JSON.stringify({ W: MW, H: MH, C });
if (payload.length > 200_000) fail(`WORLD 페이로드 ${payload.length}B > 200KB`);
writeFileSync(join(HERE, 'world-data.js'), `const WORLD = ${payload};\n`);
ok(`WORLD 직렬화 ${(payload.length / 1024).toFixed(1)}KB → tools/world-data.js`);

if (existsSync(APP)) {
  const src = readFileSync(APP, 'utf8');
  const re = /\/\/__WORLD_DATA_START__[\s\S]*?\/\/__WORLD_DATA_END__/;
  if (!re.test(src)) fail('world.html에 주입 마커가 없습니다');
  writeFileSync(APP, src.replace(re, `//__WORLD_DATA_START__\nconst WORLD = ${payload};\n//__WORLD_DATA_END__`));
  ok('world.html에 WORLD 주입 완료');
} else console.log('· world.html 없음 — 주입 생략 (파일 생성 후 재실행)');

// ---- 12. 검수 SVG ----
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}"><rect width="${MW}" height="${MH}" fill="#eef3f8"/>`];
for (const r of records)
  svg.push(`<path d="${r.path}" fill="${r.play ? '#cfd8c3' : '#e3e3e3'}" stroke="#fff" stroke-width="0.5" fill-rule="evenodd"/>`);
for (const r of records)
  if (r.play) svg.push(`<circle cx="${r.cx}" cy="${r.cy}" r="1.2" fill="#c33"/>`);
svg.push('</svg>');
writeFileSync(join(HERE, 'inspect.svg'), svg.join('\n'));
ok('검수 SVG → tools/inspect.svg');

// ---- 리포트 ----
const top5 = [...records].filter(r => r.play).sort((a, b) => b.pop - a.pop).slice(0, 5)
  .map(r => `${r.nameKo} ${(r.pop / 1e8).toFixed(1)}억`).join(', ');
console.log(`\n인구 상위: ${top5}`);
console.log(`세계 인구 합: ${(records.reduce((s, r) => s + r.pop, 0) / 1e9).toFixed(2)}B`);
