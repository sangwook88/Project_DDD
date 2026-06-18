# FE/BE DDD 기획→구현 프레임워크

**FE ↔ BE 2분할 도메인** 중심으로 막연한 아이디어부터 구현까지 끌고 가는 마크다운 워크플로우. Claude Code **플러그인**으로 패키징돼 있어 어떤 프로젝트에서든 한 번 설치하면 바로 쓴다(스킬 11종 + 에이전트 3종 + 템플릿 + `implement.ps1`).

## 핵심 개념
- **2분할 도메인** — 최상위 분할은 **FE vs BE**. 한 도메인이 둘을 다 짊어지지 않는다(수직 도메인 금지 — 기능이 쌓이면 비대해진다).
- **FE 도메인** (`docs/fe/<name>/`) — 플로우(오케스트레이션) + 표현(V). 기능 로직 금지.
- **BE 도메인** (`docs/be/<name>/`) — 데이터(M) + 기능(C). 플로우·화면 금지.
- **참조 단방향: FE → BE** — FE 요소가 BE 기능을 링크로만 부른다. BE는 FE를 모른다.
- **기능 추가 = 파일 추가** — FE는 `요소/<노드>.md`, BE는 `기능_<name>.md` 하나씩. 페이지를 부풀리지 않는다.
- **폴더 = LLM 위키** — 도메인 폴더가 계약서이자 살아있는 위키. HOME이 색인, `일지.md`가 결정 이력.

## 기획 전단 파이프라인 (desk + 7단계 스킬)

막연한 아이디어 → 티켓까지 끌고 가는 **메인 스레드 인터랙티브 스킬**. `desk`(비서/라우터)가 프로젝트 상태와 발화를 보고 지금 단계로 안내한다(자동 순회 안 함, 사람이 게이트). 전부 *값을 짓지 않고* 슬롯으로 비운다.

| 단계 | 스킬 | 역할 | 산출 |
|---|---|---|---|
| ① 브레인스토밍 | `brainstorm` | 막연한 아이디어 → 소크라테스식 → 설계 브리프 | `docs/brainstorming/*-brief.md` |
| ② 도메인 분할 | `decompose` | 기능 → FE/BE 도메인 제안·확정 | `docs/HOME.md`(지도 + 참조 그래프) |
| ③ 구체화 (FE) | `plan-fe` | 플로우 + 요소(V) 끌어내기 | `docs/fe/<name>/` |
| ③ 구체화 (BE) | `plan-be` | 데이터(M) + 기능(C) 끌어내기 | `docs/be/<name>/` |
| ④ 가지치기 | `distill` | 문서를 가지치기해 핵심 완결 문장만 남기고 결정이력은 일지로 | (도메인 폴더 문서) |
| ⑤ HTML QA | `qa` | 테스트 데이터+클릭 플로우 HTML + 7렌즈 엣지케이스 → 누락 분기 in-place 융합 | `_qa/<fe>.html` |
| ⑥ 아키텍처 | `arch` | 기술 스택·구조·패턴 정책(TS/DM)을 트레이드오프로 결정 | `docs/arch/ARCHITECTURE.md` |
| ⑦ 티켓 | `ticket` | 자기완결 티켓 + 의존 순서 플로우 → 구현 인계 | `tickets/<fe\|be>/NNNN-*.md` |

라우터: `desk`. 진입은 `desk`로 "뭐부터 하지" 하거나 단계 스킬을 직접 호출. ③ 구체화는 보통 FE 플로우 먼저 → 그 FE가 부르는 BE.

## 구현 절반 (티켓 인계 후)

티켓이 나오면 구현 오케스트레이션으로 넘어간다.

| 단계 | 도구 | 역할 |
|---|---|---|
| 구현 | `build` (skill) → `master` (agent) → `plan`/`impl` (agents) / `implement.ps1 -Side <be\|fe>` | 도메인을 기획/구현 트랙으로 분류 → 참조 그래프로 wave 편성(BE 먼저 → FE) → 구현 에이전트(impl) 병렬, 또는 티켓/도메인을 `${CLAUDE_PLUGIN_ROOT}/scripts/implement.ps1`로 |
| 위키 유지 | (도메인 폴더) | 도메인 폴더가 단일 소스. HOME이 색인, 일지가 결정 이력 |

### 에이전트 (역할별)
| 에이전트 | 역할 | 따르는 스킬 |
|---|---|---|
| `master` | 오케스트레이터 — 도메인을 기획/구현으로 분류, wave 편성, 디스패치 | `build` |
| `plan` | 기획 — 분할·전역 규약·도메인 폴더 골격 작성(값은 슬롯) | `decompose`·`plan-fe`·`plan-be`·`arch` |
| `impl` | 구현 — 배정 도메인 폴더(`docs/be/*/`·`docs/fe/*/`) 또는 티켓 1개 구현 | `impl` |

`master`가 BE·FE 도메인을 모두 `impl` 에이전트로 배정한다(BE 먼저 → FE). **계약이 BE/FE를 선언하므로 구현 에이전트는 한 종류** — 트랙별로 가르지 않는다.

## 설치 (플러그인)

이 레포 루트가 곧 **단일 플러그인을 담은 마켓플레이스**(`.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json`)다. 대상 프로젝트에서 Claude Code를 띄운 뒤:

```
# 1) 마켓플레이스 등록 — GitHub에서 바로
/plugin marketplace add lsc892/Project_DDD
# 2) 플러그인 설치
/plugin install fe-be-ddd@project-ddd
```

로컬 클론에서 쓰려면 1단계를 경로로: `/plugin marketplace add C:/path/to/Project_DDD` (git 리포여야 상대경로 source가 해석된다).

- 설치하면 스킬 11종(`brainstorm`·`decompose`·`plan-fe`·`plan-be`·`distill`·`qa`·`arch`·`ticket`·`build`·`desk`·`impl`)과 에이전트 3종(`master`·`plan`·`impl`)이 자동 등록된다. 플러그인 스킬은 이름공간이 붙어 `/fe-be-ddd:desk`처럼 보인다.
- 번들 리소스(`templates/`·`docs/conventions.md`·`scripts/implement.ps1`)는 스킬·에이전트 안에서 `${CLAUDE_PLUGIN_ROOT}`로 참조하므로 설치 위치와 무관하게 해석된다. 산출물(`docs/HOME.md`·`docs/fe|be/*/`·`docs/arch/ARCHITECTURE.md`·`tickets/`·`_qa/`)은 **대상 프로젝트** 작업 디렉토리에 생성된다.
- **일지 하네스(선택)** — `일지.md` 쓰기 전용 규칙을 켜려면 `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.snippet.md` 내용을 대상 프로젝트 `CLAUDE.md`에 한 번 붙여넣는다(플러그인은 CLAUDE.md를 자동 주입하지 않는다).
- 업데이트: `/plugin marketplace update project-ddd` 후 `/plugin update fe-be-ddd@project-ddd`. (`version`을 안 박아 매 커밋이 새 버전으로 잡힌다.)

## 사용
`/fe-be-ddd:desk`로 "뭐부터 하지" 하고 시작(또는 단계 스킬 직접 호출). 흐름: `brainstorm` → `decompose` → `plan-fe`·`plan-be` → (슬롯 채움) → `distill` → `qa` → `arch` → `ticket` → (검수) → `build` 또는 `implement.ps1`. 디테일은 사람과 대화로.

## 핵심 원칙
- AI는 값을 짓지 않는다 — 수치·규칙은 `[입력 필요]` 슬롯.
- 최상위 분할은 FE/BE. 참조는 FE → BE 단방향.
- 기능 추가 = 폴더에 파일 추가(요소/기능). 페이지 비대화 금지.
- 도메인 폴더 `일지.md`로 결정 이력 축적(LLM 위키).
- 구현 에이전트(`impl`)는 배정된 도메인 폴더(또는 티켓)만 계약서대로 구현, 경계 밖 금지. 계약이 FE/BE를 선언하므로 구현 에이전트는 한 종류.
- `일지.md`는 쓰기 전용(디버그 로그) — 에이전트가 읽지 않는다.

## 위키 배치 (기본 `docs/`)
```
docs/HOME.md              FE/BE 도메인 지도 + 참조 그래프
docs/CONTEXT.md           용어·공유 개념
docs/fe/<name>/           FE 도메인 (README·플로우.md·요소/<노드>.md·일지.md)
docs/be/<name>/           BE 도메인 (README·데이터.md·기능_<name>.md·일지.md)
docs/arch/ARCHITECTURE.md 전역 규약 + 기술 스택
docs/brainstorming/*-brief.md  brainstorm 설계 브리프
_qa/<fe>.html             qa HTML 아티팩트
tickets/<fe|be>/NNNN-*.md 구현 티켓
```

## 문서
- 규약: `docs/conventions.md`
- 설계 메모(프레임워크 자체): `docs/brainstorming/`
