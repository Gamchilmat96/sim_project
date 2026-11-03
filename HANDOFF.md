# HANDOFF — 좀비 바이러스 확산 시뮬레이션 (v1 + v2)

_갱신: 2026-11-03 · 위치: `~/Desktop/Claude_Project/personal/zombie-sim/` · 원격: https://github.com/Gamchilmat96/sim_project_

## 1. 현재 상태

**완결형으로 동작.** 의존성 없는 단일 HTML 2종:

- **v1 `index.html`** — 단일 월드 에이전트 시뮬 + SZR 실시간 적합 예측 (2026-08-10 오전 완성, 이후 무변경)
- **v2 `world.html`** (2,360줄) — 172개국 세계 팬데믹 시뮬레이션. 오늘 하루에 걸쳐 진화한 전체 기능:
  - 모델: SEZR + 3단계 부패(좀비 수명), 변이(그리스 문자·특성 🏃❄️🕶·백신 회피), 현실적 백신 배포(생산 램프·국가별 시차·치안 제약), 자연 출생/사망, 계절성, 행동 변화·방역 피로, 의료 붕괴, 정부 붕괴, 난민 흐름
  - 모드: 🤖 자동 대응(기본, 국가별 지연 5~30일·집행력 55~100%) / 🎮 수동 개입(RP 경제) · 시나리오 7종(부산행~킹덤) × 시대 4종(중세~근미래) × 커스텀 프리셋
  - 예측 3부작: 점선 예측+불확실성 밴드 · 🎲 운명 분포(몬테카를로) · 🌿 반사실 분기(90일 스냅샷) + 과거 예측 성적표
  - 🔭 현실 관측(기본 ON): 보고 지연·과소 보고 데이터로만 적합 (실제 β 0.34 → β̂ 0.167 편향이 의도된 교훈)
  - 분석 탭: 확산 리플레이 히트맵(시간 슬라이더), 에피 커브, 연대기, 스몰 멀티플, 🧪 상전이 실험(β×κ 격자), CSV/JSON 내보내기, 지난 판 기록
  - 결말 6종(🏆🛡🕯🤫🌑🧟, 패배 = 생존자 0명) · URL 시드 재현 공유 · 💾 저장/📂 불러오기 · 워커 틱(백그라운드 지속) · 온보딩
- **아티팩트 배포**: https://claude.ai/code/artifact/7652f216-5fbc-423c-9c25-d2cf800d7aff (비공개)
- **🦠 현실 모드 (2026-11-03 추가)**: 실제 병원체 프리셋 6종(코로나 원형·오미크론·1918 독감·홍역·에볼라·사스).
  같은 엔진의 감염병 해석 — 용어 교체(감염자·격리·치료율·감염 기간·엔데믹), 회복→면역(V)·면역 소멸·재감염,
  발증 전 전파(`epre`), IFR 사망 + 재감염 중증 보호, 변이 항원성(`vesc`, 홍역·에볼라·사스는 면역 회피 없음),
  현실 모드 생존 집계에 E·Z 포함. 디스클레이머 고정 표기. 상세: CHANGELOG 2026-11-03, README "🦠 현실 모드" 절.

## 2. 이번 세션(2026-11-03) 변경 사항

- `world.html` — 🦠 현실 모드 전체 (위 요약 · CHANGELOG 상세). 좀비 모드 회귀 무변화 실측(기본 win@536 생존 101.4%).
- `CHANGELOG.md`·`TROUBLESHOOTING.md` 신설 (DEV_PROCESS §0 적용 시작, 문제 5건 기록)
- `README.md` — "🦠 현실 모드" 절(프리셋 전거 표 + 한계) 추가
- `.gitignore` — `.claude/` 추가 · `.claude/launch.json`(비추적) — 서버 포트 **8932**로 이동

## 직전 세션(2026-08-10) 변경 사항

사실상 프로젝트 전체가 그 세션의 산출물. 주요 파일:

- `world.html` — v2 본체 (WORLD 지도 데이터 ~115KB 임베드 포함)
- `tools/build-world-data.mjs` — 지도 데이터 빌드 (world-atlas 110m + world-countries + World Bank 인구 join, 반자오선 분할·NE1 투영·국경 인접·항공 중력 링크). **restcountries API는 폐기됨 — 사용 금지**
- `tools/cache/` — 데이터 소스 스냅숏 (재빌드 네트워크 0)
- `tools/balance-harness.js` — 밸런스 측정 (브라우저 콘솔 붙여넣기용)
- `README.md` — 전체 기능 문서 (섹션별 상세)

## 3. 다음 할 일 (우선순위 순)

1. (선택) 현실 모드 밸런스 미세조정 — 코로나 10년 누적 사망 12%는 실제(1% 미만)보다 높음(치료제·개량 백신의 중증 억제 부재). 교육용 한계로 README에 문서화된 상태 — 줄이려면 백신 개량 시 IFR 감소 항 추가 검토
2. (선택) 코드 정비 패스 — ~2,450줄 단일 파일의 섹션 재정리. 기능 추가 전에 권장
3. (아이디어 백로그) 도시 단위 해상도 · 실험 모드 축 자유선택+CSV · 여러 판 자동 배치 통계 · 웹 워커 완전 분리
4. GitHub 저장소 정리 — 이슈/설명 추가 등

## 4. 주의할 점

- **단일 파일 + 파이썬 패치 방식으로 성장** — 문자열 앵커 기반 수정이라, 코드 수정 시 앵커 중복/불일치 주의 (assert-count 패턴 사용할 것)
- **브라우저 패널이 백그라운드면 rAF·타이머가 절전됨** — 헤드리스 검증은 콘솔 API(`pandemicSim.runDays` 등)로. 워커 틱 덕에 실제 시뮬은 백그라운드에서도 진행됨
- **URL 해시만 바꾸면 리로드가 안 됨** — 재현 링크 테스트 시 쿼리 파라미터를 붙여 강제 리로드
- 스냅샷/복원(`snapshot()`/`restoreSnap()`)이 운명 분포·상전이 실험·반사실 분기의 공통 기반 — **새 상태 변수를 추가하면 반드시 스냅샷에도 추가**할 것 (과거에 seedUsed 누락 버그 있었음)
- 밸런스 수치는 전부 하네스 실측 기반 — 파라미터 변경 시 무개입/자동 기본/부산행/나는전설이다 4종 + 병원체 6종 재측정 권장
- 차트/지도 팔레트는 dataviz 검증 통과본 — 색 변경 시 재검증 필요
- **현실 모드 집계 의미가 다르다** — 생존에 E·Z 포함(12지점, TROUBLESHOOTING #2 목록). 히트맵 계열(ha5/hcA/pcA)은 E만 더함(사망=1-(alive+Z)/pop이라 Z 중복 금지). 병원체 프리셋 추가 시 `vesc` 명시 필수
- **콘솔 검증 함정**: `scenario('custom')`은 직전 시나리오의 P·realMode를 상속 — 좀비 회귀 테스트는 리로드 후 기본 상태에서 (TROUBLESHOOTING #5)
- `rebuildUserPresets`는 `optgroup[data-up]`만 제거 — 셀렉트에 그룹 추가 시 마커 규칙 유지 (TROUBLESHOOTING #3)

## 5. 검증 방법

```bash
# 서버 (launch.json "zombie-sim" 또는):
python3 -m http.server 8932 --directory ~/Desktop/Claude_Project/personal/zombie-sim
```
- v2: http://localhost:8932/world.html → ▶ 시작 → 확산·예측·자동 대응 확인, 콘솔 에러 0 확인
- 헤드리스: 콘솔에서 `pandemicSim.scenario('busan'); pandemicSim.restart(21); pandemicSim.runDays(3700)` → win/lose/dark 결말 확인
- 현실 모드: `pandemicSim.scenario('covid'); pandemicSim.restart(1963); pandemicSim.runDays(3650)` → 엔데믹(dark) · 사스는 win(박멸) 확인, 라벨이 감염자/격리·치료율로 바뀌는지 확인
- 밸런스: `tools/balance-harness.js` 콘솔 붙여넣기
- 데이터 재빌드(선택): `node tools/build-world-data.mjs` → assert 전체 통과 + `tools/inspect.svg` 육안 확인
