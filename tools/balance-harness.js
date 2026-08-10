// 밸런스 하네스 — world.html을 연 브라우저 콘솔에 붙여넣어 실행한다.
// (시뮬 코어가 world.html 안에 있으므로 node가 아니라 페이지 콘솔에서 돈다)
// 정책 3종을 시드 고정으로 돌려 결말 분포를 측정한다.
//   무개입(none)    → 문명 붕괴(D+~410)가 나와야 정상
//   느슨한(sloppy)  → 생존율 30~40% 언저리의 상처뿐인 승리 (장기전)
//   성실한(vigilant)→ 생존율 ~100% 완벽 방어 (D+~300)
// 2026-08-10 측정치: noint 6/6 lose@399-479 · sloppy win@~2400 alive 33-40% · vigilant 4/4 win@263-326 alive 100%

(() => {
  const run = (seed, policy) => {
    pandemicSim.restart(seed);
    const milAt = {}, blocked = {};
    let s = pandemicSim.state();
    for (let step = 0; step < 170 && !s.outcome; step++) {
      if (policy === 'sloppy') {
        // 15일에 한 번, 최다 좀비 국가에 군 투입만
        const top = pandemicSim.top(2);
        if (top.length && s.rp >= 120) {
          const t = top[0].name;
          if (!(milAt[t] > s.day - 40)) { pandemicSim.act('military', t); milAt[t] = s.day; }
        }
        s = pandemicSim.runDays(15);
      } else if (policy === 'vigilant') {
        // 5일마다: 백신 러시 + 확인 국가 봉쇄/공항 폐쇄 + 군 투입
        pandemicSim.act('vaccine', 'KR');
        const top = pandemicSim.top(4);
        for (const t of top) {
          if (s.rp >= 200 && !blocked[t.name]) { pandemicSim.act('airport', t.name); pandemicSim.act('border', t.name); blocked[t.name] = true; }
          if (s.rp >= 120 && !(milAt[t.name] > s.day - 30)) { pandemicSim.act('military', t.name); milAt[t.name] = s.day; break; }
        }
        s = pandemicSim.runDays(5);
      } else s = pandemicSim.runDays(20);
    }
    return `${s.outcome ? s.outcome.type + '@' + s.outcome.day : 'ongoing@' + s.day} alive=${(s.alive / 8.19e9 * 100).toFixed(1)}%`;
  };
  const res = { noint: [], sloppy: [], vigilant: [] };
  for (let k = 1; k <= 6; k++) res.noint.push(run(1000 + k, 'none'));
  for (let k = 1; k <= 6; k++) res.sloppy.push(run(3000 + k, 'sloppy'));
  for (let k = 1; k <= 4; k++) res.vigilant.push(run(2000 + k, 'vigilant'));
  console.table(res);
  pandemicSim.restart(); // 측정 후 초기화
  return res;
})();
