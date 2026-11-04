// ===== 아웃브레이크 랩 — 플레이 봇 QA 하네스 =====
// 사용: world.html을 연 브라우저 콘솔에서 이 파일을 로드한 뒤
//   __qaInit()                          // 1000판 매트릭스 구성 (봇 10 × 시나리오 10 × 시드 10)
//   __qaStep(25)                        // 25판 실행 (반복 호출, 진행률 반환)
//   __qaExport(0,200)                   // 결과 JSON 슬라이스
// 주의: 페이지를 "새로 로드한 직후"에 돌릴 것 — 'custom' 시나리오는 직전 파라미터를
//       상속하므로(TROUBLESHOOTING #5) 매트릭스에서 custom을 맨 앞에 둔다.
// 판마다: pandemicSim.setMode → restart(seed) → [봇 결정 → qaTick(5일)] 반복 → 결과+불변식 기록.
(()=>{
  const PS=()=>window.pandemicSim;
  const COST={border:60,airport:80,military:120,dist:70};
  const DUR={border:90,airport:60,military:37,dist:60}; // military = 준비 7 + 30

  // 봇에게 주는 손: 관측(state/top)과 행동(buy/vac). buy는 같은 효과 재구매 낭비를 막는다.
  function mkApi(mem){
    return {
      st:()=>PS().state(),
      top:n=>PS().top(n),
      vac(){const s=PS().state();if(s.rp>=50&&(s.vaccine<100||(s.vacEff!=null&&s.vacEff<(s.vacEffMax||0.92))))PS().act('vaccine');},
      plat(k){PS().act('platform',k);}, // 플랫폼 1회 선택 (이미 선택·자동 모드면 무해한 no-op)
      covax(){const s=PS().state();if(s.vacEff!=null&&(s.covax||0)<3&&s.rp>=90)PS().act('covax');},
      ring(name){ // 표적 접종 — 국가당 15일 쿨다운으로 난사 방지
        const s=PS().state();
        if(s.rp<50||s.vacEff==null)return false;
        const k='r:'+name;
        if(mem['@'+k]&&s.day<mem['@'+k])return false;
        PS().act('ring',name);mem['@'+k]=s.day+15;return true;
      },
      buy(t,name){
        const s=PS().state();
        if(s.rp<COST[t])return false;
        const k=t+':'+name;
        if(mem['@'+k]&&s.day<mem['@'+k]-7)return false; // 만료 7일 전까지는 재구매 안 함
        PS().act(t,name);mem['@'+k]=s.day+DUR[t];return true;
      },
    };
  }

  // ---- 봇 10종 ----
  const BOTS={
    // 기준선 2종
    auto_observer:{mode:'auto',ds:'자동 정부 관전 (현 기본값)',decide(){}},
    idle:{mode:'manual',ds:'무개입 (최악 기준선)',decide(){}},
    // 단일 전략 4종
    vax_rush:{mode:'manual',ds:'백신 올인 — 시드 홀짝으로 mRNA/불활화 교차 (플랫폼 분화 측정)',decide(a,m){
      if(!m.p){a.plat(m.seed%2?'mrna':'inact');m.p=1;}
      a.vac();a.covax();}},
    border_hawk:{mode:'manual',ds:'국경·공항 차단 집중',decide(a){
      for(const c of a.top(6)){if(!a.buy('airport',c.name)&&a.st().rp<60)break;a.buy('border',c.name);}}},
    hammer:{mode:'manual',ds:'군 투입(검사·추적) 집중',decide(a){
      for(const c of a.top(4)){if(a.st().rp<120)break;a.buy('military',c.name);}}},
    masker:{mode:'manual',ds:'방역 통제 집중',decide(a){
      for(const c of a.top(6)){if(a.st().rp<70)break;a.buy('dist',c.name);}}},
    // 봉쇄 전략 2종 (리밸런스 검증용 — 2026-11-03)
    containment:{mode:'manual',ds:'발원 봉쇄 — 백신 무투자. 추적(군)·방역 우선, 남는 RP로 차단',decide(a){
      for(const c of a.top(8)){
        if(a.st().rp<70)break;
        a.buy('military',c.name);a.buy('dist',c.name);a.buy('airport',c.name);a.buy('border',c.name);
      }}},
    cont_then_vax:{mode:'manual',ds:'봉쇄 시도 → 실패 감지 시 백신 전환 + 배포 후 링 접종 (혼합 지배 재발 검사)',decide(a,m){
      const s=a.st();
      if(!m.sw&&(s.infected>8||s.day>150))m.sw=true;
      if(m.sw){a.vac();a.covax();}
      for(const c of a.top(m.sw?3:8)){
        if(a.st().rp<70)break;
        a.buy('military',c.name);a.buy('dist',c.name);a.buy('airport',c.name);
      }
      if(s.vacEff!=null)for(const c of a.top(3)){if(a.st().rp<100)break;a.ring(c.name);}}},
    // 복합 전략 4종
    balanced:{mode:'manual',ds:'백신+차단+소탕 삼각 편성 + 배포 후 부스터·COVAX·링',decide(a){
      let s=a.st();
      if(s.rp>=170)a.vac();
      else if(s.vacEff!=null&&s.vacEff<(s.vacEffMax||0.92)-0.1&&s.rp>=100)a.vac(); // 변이로 효율이 크게 깎이면 부스터 우선 (개량 방치는 '균형'이 아니다)
      if(s.vacEff!=null){a.covax();}
      const t=a.top(3);if(!t.length)return;
      if(a.st().rp>=120&&t[0].ratio>0.01)a.buy('military',t[0].name);
      if(a.st().rp>=80)a.buy('airport',t[0].name);
      for(const c of t.slice(1)){if(a.st().rp<70)break;a.buy('dist',c.name);}
      if(s.vacEff!=null&&a.st().rp>=120)for(const c of t.slice(0,2))a.ring(c.name);}},
    late_panic:{mode:'manual',ds:'20개국 감염 확인까지 방관 후 총력',decide(a,m){
      const s=a.st();
      if(!m.on){if(s.infected>=20)m.on=true;else return;}
      a.vac();
      for(const c of a.top(5)){const r=a.st().rp;
        if(r>=120)a.buy('military',c.name);
        else if(r>=80)a.buy('airport',c.name);
        else if(r>=60)a.buy('border',c.name);
        else break;}}},
    random_bot:{mode:'manual',ds:'무작위 행동 (결정적 시드)',decide(a,m){
      if(m.r==null)m.r=((m.seed*2654435761)>>>0)||1;
      const rnd=()=>{m.r=(Math.imul(m.r,1664525)+1013904223)>>>0;return m.r/4294967296;};
      if(rnd()<0.5)return;
      const s=a.st();if(s.rp<50)return;
      const ty=['border','airport','military','dist','vaccine'][Math.floor(rnd()*5)];
      if(ty==='vaccine'){a.vac();return;}
      const t=a.top(8);if(!t.length)return;
      a.buy(ty,t[Math.floor(rnd()*t.length)].name);}},
    auto_plus_vax:{mode:'auto',ds:'자동 정부 + 플레이어는 백신 투자만 지원',decide(a){a.vac();}},
  };

  // ---- 매트릭스: 시나리오 10 × 봇 10 × 시드 10 = 1000 (custom이 맨 앞: 신선한 로드 직후 기본 좀비) ----
  const SCS=['custom','busan','wwz','days28','legend','covid','omicron','flu1918','ebola','sars03'];
  const SEEDS=[101,102,103,104,105,106,107,108,109,110];

  function runOne(botKey,sc,seed){
    const bot=BOTS[botKey],mem={seed};
    const api=mkApi(mem);
    const t0=performance.now();
    PS().setMode(bot.mode);
    PS().restart(seed);
    let guard=0;
    while(guard++<740){
      bot.decide(api,mem);
      if(PS().qaTick(5,false))break;
      if(PS().state().day>=3650)break;
    }
    const s=PS().state(),q=PS().qaStats();
    const inv=[];
    const tot=q.S+q.E+q.Z+q.V+q.R+q.F;
    if(![q.S,q.E,q.Z,q.V,q.R,q.F,tot,s.alive].every(Number.isFinite))inv.push('NaN');
    if(q.neg)inv.push('neg-compartment:'+q.neg);
    const aliveP=s.alive/q.NW*100;
    if(!(aliveP>=-0.01&&aliveP<=140))inv.push('aliveP-range:'+aliveP.toFixed(1));
    if(s.outcome){
      if(s.outcome.type==='win'&&q.Z+q.E>=1)inv.push('win-but-ZE-left');
      if(s.outcome.type==='lose'&&s.alive>=1)inv.push('lose-but-alive');
      if(s.outcome.type==='dark'&&s.day<3650)inv.push('dark-early');
    } else if(s.day<3650)inv.push('stalled-no-outcome');
    if(s.rp<0)inv.push('rp-negative');
    if(q.sc!==sc)inv.push('scenario-mismatch:'+q.sc);
    return {bot:botKey,sc,seed,mode:bot.mode,out:s.outcome?s.outcome.type:'none',day:s.day,
      aliveP:+aliveP.toFixed(2),deadP:+(q.R/q.NW*100).toFixed(2),peakZP:+(q.peakZ/q.NW*100).toFixed(3),
      infected:s.infected,variants:s.variants,vacProg:s.vaccine,vacEff:s.vacEff,plat:s.plat||null,
      vacDay:q.vacDoneDay>=0?q.vacDoneDay:null,real:q.real?1:0,
      rpSpent:q.stats.rpSpent,b:q.stats.border,a:q.stats.airport,m:q.stats.military,d:q.stats.dist,v:q.stats.vacBuys,rg:q.stats.ring||0,cv:q.stats.covax||0,
      inv:inv.join('|'),ms:Math.round(performance.now()-t0)};
  }

  window.__qaInit=function(){
    const cfgs=[];
    for(const sc of SCS)for(const bot of Object.keys(BOTS))for(const seed of SEEDS)cfgs.push({sc,bot,seed});
    window.__qa={cfgs,results:[],i:0,lastSc:null,jsErrors:[]};
    window.onerror=(msg,src,ln)=>{window.__qa.jsErrors.push(msg+' @'+ln);};
    PS().qaMode(true);
    const q=PS().qaStats();
    return {total:cfgs.length,startScenario:q.sc,realMode:q.real,
      warn:q.sc!=='custom'?'페이지를 새로 로드한 뒤 실행할 것 (custom이 기본 좀비가 아님)':null};
  };

  window.__qaStep=function(k){
    const Q=window.__qa;
    const end=Math.min(Q.i+k,Q.cfgs.length);
    for(;Q.i<end;Q.i++){
      const c=Q.cfgs[Q.i];
      if(c.sc!==Q.lastSc){PS().scenario(c.sc);Q.lastSc=c.sc;}
      try{Q.results.push(runOne(c.bot,c.sc,c.seed));}
      catch(e){Q.results.push({bot:c.bot,sc:c.sc,seed:c.seed,out:'ERROR',inv:'exception:'+String(e).slice(0,200)});}
    }
    const done=Q.i>=Q.cfgs.length;
    if(done){PS().qaMode(false);PS().setMode('auto');PS().restart();}
    const last=Q.results[Q.results.length-1];
    const bad=Q.results.filter(r=>r.inv).length;
    return {i:Q.i,total:Q.cfgs.length,done,badSoFar:bad,jsErrors:Q.jsErrors.length,
      last:last&&{bot:last.bot,sc:last.sc,out:last.out,day:last.day,aliveP:last.aliveP,ms:last.ms}};
  };

  window.__qaExport=function(from,to){return JSON.stringify(window.__qa.results.slice(from,to));};
  // 파라미터 튜닝용 부분 실행 — 전체 매트릭스와 별개로 지정 조합만 돌린다
  window.__qaSpot=function(bots,scs,seeds){
    PS().qaMode(true);
    const out=[];let lastSc=null;
    for(const sc of scs){PS().scenario(sc);lastSc=sc;
      for(const bot of bots)for(const seed of seeds)out.push(runOne(bot,sc,seed));}
    PS().qaMode(false);
    const med=a=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
    const agg={};
    for(const r of out){const k=r.sc+'|'+r.bot;(agg[k]=agg[k]||[]).push(r);}
    const sum={};
    for(const k in agg)sum[k]=med(agg[k].map(r=>r.aliveP)).toFixed(1)+'% '+agg[k].filter(r=>r.out==='win').length+'/'+agg[k].length+'승';
    return {sum,bad:out.filter(r=>r.inv).length};
  };
  window.__qaSummary=function(){
    const R=window.__qa.results,agg={};
    for(const r of R){
      const k=r.sc+'|'+r.bot;
      agg[k]=agg[k]||{n:0,win:0,dark:0,lose:0,err:0,al:[],bad:0};
      const a=agg[k];a.n++;
      if(r.out==='win')a.win++;else if(r.out==='dark')a.dark++;else if(r.out==='lose')a.lose++;else a.err++;
      if(r.aliveP!=null)a.al.push(r.aliveP);
      if(r.inv)a.bad++;
    }
    return agg;
  };
  console.log('qa-bots 로드 완료 — __qaInit() → __qaStep(k) 반복 → __qaExport()');
})();
