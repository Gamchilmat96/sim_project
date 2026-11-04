// 봇 배치 분포 → world.html의 BASELINES 상수 재생성
// 사용: node tools/make-baselines.mjs qa/bot-runs-<날짜>.json [엔진커밋해시]
// 규칙(QA_CHECKLIST): 밸런스를 바꾸면 반드시 '커밋된 엔진'으로 매트릭스를 재주행한 뒤 이 도구로 재생성한다.
// 주의: 아래 채점식은 world.html computeScore()와 수동 동기 — 한쪽을 바꾸면 양쪽을 바꾼다.
import fs from 'node:fs';

const [runsPath, engine='uncommitted'] = process.argv.slice(2);
if(!runsPath){console.error('usage: node tools/make-baselines.mjs <runs.json> [engineHash]');process.exit(1);}
const WORLD='world.html';
const NW=8.19e9; // 현대 시대 세계 인구 (매트릭스는 modern 고정)

const D=JSON.parse(fs.readFileSync(runsPath,'utf8'));
const runs=D.runs||D;
const med=a=>{if(!a.length)return null;a=[...a].sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const r1=x=>x==null?null:+x.toFixed(1);
const perf=r=>r.real?100-r.deadP:r.aliveP;

const scs=[...new Set(runs.map(r=>r.sc))];
const B={_meta:{src:runsPath.split('/').pop(),engine,runs:runs.length}};
const report=[];
for(const sc of scs){
  const man=runs.filter(r=>r.sc===sc&&r.mode==='manual');
  const auto=runs.filter(r=>r.sc===sc&&r.bot==='auto_observer');
  const idleRuns=man.filter(r=>r.bot==='idle');
  if(!man.length||!auto.length||!idleRuns.length){console.error(`skip ${sc}: 데이터 부족`);continue;}
  const idle=med(idleRuns.map(perf));
  const autoP=med(auto.map(perf)), autoDead=med(auto.map(r=>r.deadP));
  // 최적 봇: (승수 desc, 성과 중앙 desc) — idle 제외
  const bots={};
  for(const r of man){if(r.bot==='idle')continue;(bots[r.bot]=bots[r.bot]||[]).push(r);}
  let bestBot=null,bestStat=null;
  for(const [b,rows] of Object.entries(bots)){
    const wins=rows.filter(r=>r.out==='win').length, p=med(rows.map(perf));
    if(!bestStat||wins>bestStat.wins||(wins===bestStat.wins&&p>bestStat.p))bestBot=b,bestStat={wins,p,rows};
  }
  const bestDay=med(bestStat.rows.filter(r=>r.out==='win').map(r=>r.day));
  const base={idle:r1(idle),auto:r1(autoP),autoDead:r1(autoDead),best:r1(bestStat.p),bestBot,bestDay:bestDay?Math.round(bestDay):null};
  // 수동 봇 전 판 채점 → 점수 십분위 (computeScore와 동일식)
  const head=Math.max(base.auto,base.best)-base.idle;
  const cl=x=>Math.max(0,Math.min(1,x));
  const scores=man.map(r=>{
    const p=perf(r);
    const sOut=r.out==='win'?40:r.out==='dark'?10:0;
    const sResc=head>=3?35*cl((p-base.idle)/head):35*cl(1-(base.idle-p)/20);
    const sSpd=r.out==='win'&&base.bestDay?15*cl(0.5+0.35*Math.log2(base.bestDay/Math.max(1,r.day))):0;
    const sEff=10*cl((p-base.idle)*NW/(100*Math.max(1,r.rpSpent||0)*2e6));
    return Math.round(Math.max(0,Math.min(100,sOut+sResc+sSpd+sEff)));
  }).sort((a,b)=>a-b);
  base.dec=Array.from({length:11},(_,k)=>scores[Math.min(scores.length-1,Math.floor(k/10*(scores.length-1)))]);
  B[sc]=base;
  report.push(`${sc.padEnd(8)} idle ${String(base.idle).padStart(6)} auto ${String(base.auto).padStart(6)} best ${String(base.best).padStart(6)} (${bestBot}, D+${base.bestDay??'—'}) dec[${base.dec[0]}…${base.dec[10]}]`);
}

const html=fs.readFileSync(WORLD,'utf8');
const S='/*__BASELINES_START__*/', E='/*__BASELINES_END__*/';
const i0=html.indexOf(S), i1=html.indexOf(E);
if(i0<0||i1<0){console.error('world.html에 BASELINES 마커 없음');process.exit(1);}
fs.writeFileSync(WORLD, html.slice(0,i0+S.length)+JSON.stringify(B)+html.slice(i1));
console.log(report.join('\n'));
console.log(`BASELINES 주입 완료 — ${Object.keys(B).length-1}개 시나리오, 엔진 ${engine}`);
