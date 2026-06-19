---
name: ticket
description: QA와 아키텍처가 끝난 도메인을 콜드 스타트로 구현 가능한 자기완결 티켓(tickets/<fe|be>/NNNN-<slug>.md)으로 그릴하고 의존 순서 플로우를 그리는 스킬(기획 전단 7단계, 종료). 책임 도메인 분류 → 구조 결정(ARCHITECTURE 패턴 기본값 계승 vs 대안) → 엣지케이스 심층 분석. 산출 티켓은 scripts/implement.ps1 -Side <fe|be>로 구현 엔진에 넘겨 새 브랜치에서 "구현만" 시킨다. 티켓만 쓴다(코드·엔진 호출 안 함). "티켓 만들어줘", "이거 티켓화", "티켓 플로우 그려", "ticket" 류에 사용.
---

# ticket — 구현 티켓 + 의존 플로우 (기획 전단 7단계, 종료)

도메인을 자기완결 티켓으로 그릴하고 의존 순서를 그린다. 전제: [qa](../qa/SKILL.md) 통과 + [arch](../arch/SKILL.md)로 `docs/arch/ARCHITECTURE.md` 확정. 규약: [docs/conventions.md](${DDD_ROOT}/docs/conventions.md). 산출: `tickets/<fe|be>/NNNN-<slug>.md`.

구현 엔진은 티켓 밖을 안 건드린다 → **모호하면 구현이 샌다.** 작성 전 그릴로 갈림길을 닫고 한 장에 ①책임 도메인 ②구조(패턴) ③엣지케이스를 못 박는다. **이 스킬은 티켓만 쓴다** — 코드도 엔진 호출도 안 한다(검수 게이트 보존).

## 1. 시작 전 읽기 (이 순서)
1. `docs/arch/ARCHITECTURE.md` §1 기술 스택 · §4 패턴 정책 — 스택·레이어·패턴 기본값.
2. `docs/CONTEXT.md` + `docs/HOME.md` — FE/BE 도메인 지형·참조 그래프.
3. 후보 도메인 폴더 `docs/be/<name>/`(데이터.md·기능_*.md) 또는 `docs/fe/<name>/`(플로우.md·요소/*.md). 일지는 읽지 않는다(write-only).
4. 만질 코드 — 해당 도메인 소스(있으면).
5. `tickets/<fe|be>/` 기존 티켓 — 번호 채번 + 미완 충돌 확인.

## 2. 책임 도메인 분류
| 항목 | 값 |
|---|---|
| 1차 책임 도메인 | `be/<name>` (데이터·규칙의 소유자) 또는 순수 플로우면 `fe/<name>` |
| 단계 | M / C(BE) · V(FE) — 복합이면 모두 |
| 가로지르는 도메인 | FE→BE 호출·BE→BE 의존으로 닿는 도메인(참조 방향) |
| 분류 근거 | "이 데이터/규칙을 가진 곳이 책임진다" — CONTEXT 어휘로 1~2줄 |
경계가 애매하면 임의로 가르지 말고 **첫 갈림길**로 올려 묻는다. 보통 BE 기능 티켓(C)과 그것을 부르는 FE 플로우 티켓(V)을 따로 끊는다.

## 3. 구조 결정 — 패턴 타협
ARCHITECTURE §4 패턴 정책의 도메인 기본값(TS/DM)에서 출발. 이 기능 성격이 기본값과 맞으면 그대로 + *왜* 한 줄. 어긋나면 트레이드오프로 제안(A 기존 계승 / B 대안). 한 번에 한 갈림길, skeptic 기본. 규약 이탈이면 티켓에 근거 명시 + 도메인 `일지` 한 줄. 코드로 답할 수 있으면 직접 읽는다.

## 4. 엣지 케이스 심층 분석
한 패스로 전수 스윕: 경계값(0·음수·최대·빈 컬렉션) / 상태·순서(중복·동시·재진입·잘못된 시점) / 수명(정리 시점) / 통지(늦은 구독·중복 발화) / 데이터 결손(id 미스·행 없음) / 상호작용(가로지름 충돌·순환). 각 케이스를 표로(`케이스 / 기대 동작 / 처리 위치`). QA에서 융합된 분기를 근거로. 모르면 추측 말고 갈림길로.

## 5. 티켓 작성
[templates/ticket.md](${DDD_ROOT}/templates/ticket.md)를 복제해 채운다:
- 경로: `tickets/<fe|be>/NNNN-<영문-slug>.md` (NNNN = 그 측 폴더의 기존 최대 +1, 4자리).
- 프런트매터 필수: `id` · `branch`(feat/<slug>) · `base`(기본 main) · `domain`(fe/<name> 또는 be/<name>) · `stage`(M/C/V) · `pattern`(TS/DM, ARCHITECTURE 기준) · `engine`(codex/claude) · `status: ready` · `created`.
- **자기완결성** — 콜드 에이전트가 이 티켓만 읽고 구현 가능한가? 변경 파일 경로·시그니처·DTO 필드가 구체적. "적절히"·"알아서" 금지.
- **범위 경계(하지 말 것)** 필수.

## 6. 의존 순서 플로우
`docs/HOME.md` 참조 그래프로 티켓을 **wave/순서**로 묶는다 — BE 도메인 먼저(FE가 부르는 기능이 있어야 하므로), 그 BE를 부르는 FE는 뒤. BE 간 의존은 단방향 순서대로. 순환 보이면 멈추고 decompose 경계 재검토 안내. 출력: 티켓 번호 × 순서 표.

## 7. 종료 → 핸드오프
1. 티켓 경로 목록 + 책임 도메인 + 핵심 구조 결정 + 의존 순서 + 미결 1줄 요약.
2. 구조 이탈 결정했으면 도메인 `일지` 기록 확인.
3. 안내 — **티켓 검수 후** 아래로(스킬이 직접 호출하지 않는다):
   ```
   pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side be -Ticket tickets/be/NNNN-<slug>.md
   pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side fe -Ticket tickets/fe/NNNN-<slug>.md
   ```
   `base`에서 `branch`를 따 `engine`에게 "이 티켓만 구현"시킨다(기존 구현 절반). 검토·커밋·푸시는 사람.
