# FE/BE DDD 기획→구현 프레임워크

**막연한 아이디어를 FE/BE 도메인 기반 LLM 위키로 구체화하고, 개발·관리까지 한 흐름으로 끌고 가는 Claude Code 에이전트·스킬 번들.**

산출물은 슬라이드가 아니라 **작고 단일 책임인 마크다운 도메인 폴더** — 사람이 읽는 문서이자 AI가 그대로 구현하는 계약서입니다. 그래서:

- **결과물이 곧 자산** — 기능이 늘면 페이지가 부푸는 게 아니라 파일이 하나 더 생깁니다.
- **변경도 자동(AX)** — 위키가 기계가 읽는 단일 소스라, 회의록·기획 문서를 `raw/`에 던지면 `intake`가 도메인을 분류해 반영·구현까지 알아서 돌립니다.
- **스킬을 외울 필요 없음** — 단계마다 알맞은 스킬을 자동으로 골라 씁니다. AI는 값을 짓지 않고, 빈 값은 `[입력 필요]` 슬롯으로 사람에게 되묻습니다.

![Tool](https://img.shields.io/badge/Claude%20Code-agents%2Bskills-8A2BE2)
![Install](https://img.shields.io/badge/install-npx-cb3837)
![Skills](https://img.shields.io/badge/skills-13-339933)

## 흐름

```text
아이디어
  -> brainstorm   소크라테스식 질문 -> 설계 브리프
  -> roadmap      핵심 기능 -> 버전(v1→vN) 스코프 분배 + 현재 타깃 버전
  -> decompose    현재 타깃 버전 -> FE/BE 도메인 분할
  -> plan-fe/be   플로우·표현 / 데이터·기능 끌어내기
  -> distill      핵심 문장만 남기고 결정이력은 일지로
  -> qa           HTML 클릭 플로우 + 7렌즈 누락 -> 융합
  -> arch         기술 스택·구조 결정
  -> ticket       자기완결 티켓 -> 구현 인계
  -> dev          의존 정렬(BE→FE) -> 병렬 구현
```

brainstorm·roadmap만 사람과 대화하고 나머진 알아서 진행됩니다(직접 한 단계만 부르고 싶으면 그 스킬을 호출). 규칙 셋: **FE/BE 2분할** · **참조 FE→BE 단방향** · **기능 추가 = 파일 추가**. 그리고 **버전 게이트** — 모든 하류 단계는 roadmap의 현재 타깃 버전 범위 안에서만 돕니다.

## 결과물 — 도메인 폴더 한 장

```text
docs/
├─ HOME.md               도메인 지도 + FE→BE 참조 그래프 (색인)
├─ fe/checkout/          FE 도메인 — 화면 흐름·표현만 (플로우.md·요소/*.md·일지.md)
└─ be/payment/           BE 도메인 — 데이터·기능만 (데이터.md·기능_*.md·일지.md)
```

`HOME.md` 색인 → 도메인 폴더 → 그 안의 플로우/데이터. 폴더 구조가 곧 지도이고, 그 폴더가 에이전트의 계약서입니다. 참조가 단방향이라 한쪽을 고쳐도 영향 범위가 그래프로 드러납니다.

## 설치

에이전트 5종 + 스킬 13종 + 템플릿/스크립트 번들을 깔아줍니다. **어디에** 깔지를 먼저 정하세요.

### 전역 — 모든 프로젝트에서 사용 (기본)

```bash
npx github:lsc892/Project_DDD
```

`~/.claude`에 설치되어 **어느 폴더에서 Claude Code를 켜든** `desk`·`intake`·`dev` … 가 뜹니다. 실행한 프로젝트 폴더에는 아무 파일도 만들지 않습니다 — 정상입니다(산출물 `docs/`·`tickets/` 등은 *스킬을 쓸 때* 그 프로젝트에 생성됩니다).

### 프로젝트 한정 — 그 프로젝트에서만 적용

특정 프로젝트에서만 에이전트·스킬을 쓰려면 그 프로젝트 폴더 안에서:

```bash
npx github:lsc892/Project_DDD --project .
```

`<project>/.claude/` 에 설치되어, **그 프로젝트를 열었을 때만** 에이전트·스킬이 뜹니다(전역은 건드리지 않음). 팀 레포에 커밋해 함께 쓰거나, 전역을 깔지 않고 프로젝트별로 격리할 때 유용합니다. 경로를 직접 줘도 됩니다: `--project ../다른프로젝트`.

### 제거 · 기타

- 전역 제거: `npx github:lsc892/Project_DDD --uninstall`
- **프로젝트 설치는 같은 위치에서 `--uninstall --project .` 로 제거**합니다(설치할 때 `--project`를 줬으면 제거할 때도 줘야 함). 그냥 `--uninstall`만 쓰면 전역을 대상으로 하며, 프로젝트 설치본이 따로 있으면 그 제거 명령을 안내합니다.
- 미리보기 `--dry-run` (설치·제거 모두, `--project` 와 조합 가능)
- 로컬 클론이면: `node bin/install.mjs`

설치 후 Claude Code를 재시작하면 적용됩니다.

## 사용법

기본은 **에이전트에 맡기기** — 스킬을 외울 필요 없이 라우터에게 말하면 알맞은 단계를 골라 돌립니다.

```text
/desk     # 기획 — "뭐부터 하지" 하면 지금 단계로 안내·디스패치
/intake   # 운영 중 들어온 문서를 raw/에 떨군 뒤 (변경 자동 반영)
```

한 단계만 콕 집어 돌리려면 그 스킬을 직접 부르면 됩니다(`/decompose`·`qa`·`dev` 등). 게이트는 사람이 엽니다 — 라우터는 자동 순회하지 않습니다.

---

아래는 상세 레퍼런스.

## 기획 전단 파이프라인 (8단계 스킬)

전부 *값을 짓지 않고* 슬롯으로 비웁니다. 평소엔 자동으로 진행되고, 한 단계만 직접 돌리고 싶을 때 스킬을 부릅니다. ②부터는 roadmap이 잡은 **현재 타깃 버전** 범위 안에서 돕니다.

| 단계 | 스킬 | 산출 |
|---|---|---|
| ① 브레인스토밍 | `brainstorm` | `docs/brainstorming/*-brief.md` |
| ② 버전 로드맵 | `roadmap` | `docs/roadmap.md`(v1→vN 스코프 + 현재 타깃 버전) |
| ③ 도메인 분할 | `decompose` | `docs/HOME.md`(지도 + 참조 그래프) |
| ④ 구체화 FE/BE | `plan-fe`·`plan-be` | `docs/fe/<name>/`·`docs/be/<name>/` |
| ⑤ 가지치기 | `distill` | (도메인 폴더 문서 정제) |
| ⑥ HTML QA | `qa` | `_qa/<fe>.html` + 누락 분기 in-place 융합 |
| ⑦ 아키텍처 | `arch` | `docs/arch/ARCHITECTURE.md` |
| ⑧ 티켓 | `ticket` | `tickets/<fe\|be>/NNNN-*.md` |

## 구현 (티켓·도메인 인계 후)

`dev`에 구현할 도메인을 넘기면(여러 개면 통째로) 의존 그래프로 BE→FE 정렬해 도메인별 구현 서브에이전트를 병렬 디스패치합니다. 별도 빌드 진입점은 없습니다 — dev가 단일 구현 두뇌입니다. 미완(빈 슬롯) 도메인은 구현으로 넘기지 않고 기획으로 되돌립니다. 헤드리스로 돌리려면 `pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side <be|fe> -Domain <name>`.

## 변경 접수 (intake) — 운영 중 들어오는 문서

회의록·신규 기획·아이디어·리팩토링 메모를 `raw/`에 떨구면, `intake`(종합 창구)가 문서당 브랜치(worktree)를 파고 **문서를 기획 부분·개발 부분으로 갈라** plan·dev에 분배합니다.

```text
raw/<문서>.md  ->  /intake (스캔·게이트)  ->  문서당 브랜치에서 분석·분배
  새 도메인 경계 -> 멈추고 "decompose 하세요" (경계는 사람 게이트)
  기획 부분      -> plan이 문서 반영 (+FE 플로우면 QA HTML)
                    개발 유발 시 "개발 인계 메모" -> dev
  개발 부분      -> dev가 티켓으로 분해·발행 -> 멈춤
                    [사람이 티켓 검수·승인] -> dev가 worktree에서 구현
```

복합 문서면 intake, 특정 개발/기획이면 `dev`·`plan` 직접 호출, dev/plan이 범위를 넘으면 거꾸로 intake로 올립니다.

브랜치엔 로컬 커밋만 — push·merge는 사람. 처리된 문서는 `raw/_done/`으로. `decompose`가 *맨 처음* 경계를 가른다면, `intake`는 *운영 중* 변경을 위키에 반영·구현으로 라우팅하는 상시 입구입니다.

## 위키 배치 (기본 `docs/`)

```text
docs/HOME.md              FE/BE 도메인 지도 + 참조 그래프
docs/CONTEXT.md           용어·공유 개념
docs/fe/<name>/           FE 도메인 (플로우.md·요소/<노드>.md·일지.md)
docs/be/<name>/           BE 도메인 (데이터.md·기능_<name>.md·일지.md)
docs/arch/ARCHITECTURE.md 전역 규약 + 기술 스택
_qa/<fe>.html             qa HTML 아티팩트
tickets/<fe|be>/NNNN-*.md 구현 티켓
raw/<문서>.md             intake 인박스 (처리되면 raw/_done/)
```

산출물은 모두 **대상 프로젝트** 작업 디렉토리에, 리소스(`templates/`·`scripts/`·`docs/`)는 `${DDD_ROOT}`로 참조됩니다. `일지.md`는 쓰기 전용 결정 로그 — 에이전트는 읽지 않습니다.

## 설치 — 자세히

`npx`가 파일을 `.claude/` 바로 밑에 평탄하게 깝니다(`/desk`, `/decompose` …). 레이아웃:

```text
.claude/
├─ agents/      dev·plan·qa·intake·research
├─ skills/      brainstorm·roadmap·decompose·… ticket (13종)
├─ docs/        conventions (규약)
├─ templates/   기능·데이터·요소·플로우·sim.html·ticket …
└─ scripts/     implement.ps1
```

설치기가 복사하면서 스킬·에이전트 본문의 `${DDD_ROOT}`·`${DDD_HOME}` 토큰을 **위치 독립 참조**로 치환합니다 — `--project` 설치는 프로젝트-상대(`.claude/…`), 전역 설치는 홈-상대(`~/.claude/…`). 머신·사용자 절대경로가 박히지 않아 `.claude/` 를 통째로 커밋·이식해도 깨지지 않습니다.

- **일지 하네스(선택)** — `${DDD_ROOT}/templates/CLAUDE.snippet.md`를 대상 `CLAUDE.md`에 한 번 붙여넣으면 켜집니다(자동 주입 안 함).
- **업데이트** — `npx github:lsc892/Project_DDD` 재실행(덮어씀). **제거** — 같은 명령에 `--uninstall`.

## 문서

- 규약: `docs/conventions.md`
- 설계 메모(프레임워크 자체): `docs/brainstorming/`
