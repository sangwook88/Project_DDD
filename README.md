# 수직 도메인 DDD 기획→구현 프레임워크

어떤 프로젝트든 `.claude/`에 드롭인해, **기능별 수직 도메인** 중심으로 기획부터 구현까지 끌고 가는 마크다운 프레임워크.

## 핵심 개념
- **수직 도메인** — 기능 단위로 가른 한 덩어리. 각 도메인이 프론트(씬)+백(데이터)을 세로로 관통한다.
- **도메인 내 레이어** — 도메인 *안에서* 씬(UI·플로우·V) ↔ 데이터(M·C)로 나뉜다(최상위 축 아님).
- **도메인 페이지 = LLM 위키** — 도메인당 1페이지(`docs/domains/<name>.md`)가 계약서이자 살아있는 위키. 이후 이해·수정은 이 페이지로.

## 파이프라인 (4단계)
| 단계 | 도구 | 역할 |
|---|---|---|
| ① 분할 확정 | `ddd-decompose` (skill) | 기능 → 수직 도메인 제안·확정 → `docs/HOME.md`(도메인 지도 + 의존 그래프) |
| ② 명세 | `ddd-spec` (skill) | 모든 도메인을 구현 전에 도메인당 1페이지로 명세(역할·수용기준·경계·의존·패턴·상태·일지) |
| ③ 구현 | `ddd-build` (skill) → `ddd-domain-impl` (agent) / `scripts/implement.ps1` | 의존 그래프로 wave 편성 → 백엔드 선택(Agent 병렬 / implement.ps1) → 도메인별 서브에이전트 |
| ④ 위키 유지 | (도메인 페이지) | 도메인 페이지가 단일 소스. HOME이 색인, 일지가 결정 이력 |

전역 규약(레이어·의존·패턴 정책 TS/DM)은 `dev-arch` (skill)로 1회 `docs/arch/ARCHITECTURE.md`에 고정한다.

## 사용
대상 프로젝트 `.claude/`에 `agents/`·`skills/`·`scripts/` 복사, `templates/` 동봉. `templates/CLAUDE.snippet.md`를 대상 CLAUDE.md에 붙여 일지 하네스를 켠다.
`dev-arch`(전역 규약) → `ddd-decompose` → `ddd-spec` → (사람이 슬롯 채움) → `ddd-build` 순. 디테일은 사람과 대화로.

## 핵심 원칙
- AI는 값을 짓지 않는다 — 수치·규칙은 `[입력 필요]` 슬롯.
- 도메인은 수직(기능)으로 가른다. 씬/데이터는 도메인 *안*의 레이어.
- 도메인 페이지 `일지`로 결정 이력 축적(LLM 위키).
- 서브에이전트는 도메인 페이지 계약서대로 구현만, 경계 밖 금지.

## 위키 배치 (기본 `docs/`)
```
docs/HOME.md              도메인 지도 + 의존 그래프
docs/CONTEXT.md           용어·공유 개념
docs/domains/<name>.md    도메인당 1페이지 (계약서 = 위키)
docs/arch/ARCHITECTURE.md 전역 규약
```

## 문서
- 규약: `docs/conventions.md`
- 스펙: `docs/superpowers/specs/2026-06-18-도메인-수직-워크플로우-재편-design.md`
- 계획: `docs/superpowers/plans/2026-06-18-도메인-수직-워크플로우-재편.md`

## 아카이브
구 씬/데이터 2분할 파이프라인(`plan-*`)과 구 템플릿은 `archive/`에 보존. 7렌즈 HTML 시뮬(`templates/sim.html`)은 선택적 부가기능.
