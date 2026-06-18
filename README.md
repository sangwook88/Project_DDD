# Project_DA — 범용 DDD 기획→구현 프레임워크

어떤 프로젝트든 `.claude/`에 드롭인해, **기획 단계부터 DDD(씬/데이터 두 컨텍스트) 중심으로 구현까지** 끌고 가는 마크다운 프레임워크.

## 두 컨텍스트
- **씬(Scene)** — UI 요소 + 플로우 (프론트). 플로우 + 표현(V).
- **데이터(Data)** — 내부 데이터 + 기능 (백엔드). 데이터(M) + 기능(C).

## 파이프라인
| 단계 | 도구 | 역할 |
|---|---|---|
| ① 조언 | `plan-advise` (agent) | 아이디어 → 씬/데이터/둘다 분류 + 함의·엣지 미리보기 |
| ② 문서화 | `plan-document` (agent) → `plan-scene`/`plan-data`/`plan-distill` (skill) | LLM 위키 구축(신규 vs 기존 판별) |
| ③ 시뮬 | `plan-qa` (agent) → `plan-simulate` (skill) | 단일 HTML로 그린 대로 클릭 워크 → 7렌즈 누락 취합 → 위키 융합 |
| ④ 아키텍처 | `dev-arch` (skill) | 레이어 + 패턴 정책(트랜잭션 스크립트 ↔ 도메인 모델) |
| ⑤ 티켓 | `dev-ticket` (skill) | 스펙 → 자기완결 티켓(branch frontmatter) + 기능별 패턴 |
| ⑥ 구현 | `scripts/implement.ps1` | 티켓 → base에서 branch 따고 codex/claude로 "구현만" |

## 사용
대상 프로젝트 `.claude/`에 `agents/`·`skills/`·`scripts/` 복사, `templates/`·`docs/conventions.md` 동봉. `templates/CLAUDE.snippet.md`를 대상 CLAUDE.md에 붙여 일지 하네스를 켠다.
`plan-advise` → `plan-document` → `plan-qa` → `dev-arch` → `dev-ticket` → `implement.ps1` 순. 디테일은 사람과 대화로.

## 핵심 원칙
- AI는 값을 짓지 않는다 — 수치·규칙은 `[입력 필요]` 슬롯.
- 씬=플로우+표현 / 데이터=데이터+기능 경계 엄수.
- 도메인 일지 하네스로 결정 이력 축적(LLM 위키).

## 문서
- 규약: `docs/conventions.md`
- 스펙: `docs/superpowers/specs/2026-06-17-범용-ddd-프레임워크-design.md`
- 계획: `docs/superpowers/plans/2026-06-17-범용-ddd-프레임워크.md`
