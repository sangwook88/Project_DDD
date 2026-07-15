---
name: track-issue
description: GitHub 이슈 하나를 골라 dev단에서 시작 — 직접 고치지 않고 ticket으로 티켓화한 뒤 dev(구현 엔진)로 구현하고, 사용자가 "해결했다"고 하면 PR로 squash 머지하며 PR 본문의 `Closes #<번호>`로 이슈를 자동 종료한다. 범위가 넓으면 decompose/dev로 먼저 쪼갠다. "/track-issue", "이 이슈 처리해줘", "이슈 해결하고 머지해줘" 일 때 사용.
argument-hint: "(선택) 이슈 번호"
---

# Track Issue — GitHub 이슈 → 티켓 → 구현 (안내데스크)

GitHub 이슈를 **선택 → 범위 분류 → ticket으로 티켓화 → dev로 구현 → (사용자 OK 시) PR로 머지·자동 종료** 순서로 처리한다.
플랫폼은 GitHub(`gh`), 구현은 이 프로젝트의 **ticket→dev 파이프라인**이다.

**[track-task](../track-task/SKILL.md)와 같은 안내데스크 문법이다 — 이슈를 직접 고치지 않는다.**
이슈를 **dev단 진입점**으로 보고 [ticket](../../../skills/ticket/SKILL.md)으로 티켓화한 뒤 [dev](../../../skills/dev/SKILL.md)로 구현시킨다.
track-issue 자신은 선택·분류·인계와 **이슈 종료(PR 머지·`Closes #N`)** 만 맡는다. 규약 SoT: [docs/conventions.md](../../../docs/conventions.md) · `docs/arch/ARCHITECTURE.md` · `docs/HOME.md`.

**이 스킬을 수행하는 동안 사용자에게 보내는 모든 응답·확인 질문·보고는 한글로 작성한다.**

## 절대 규칙
1. **직접 고치지 않는다.** 코드 구현은 ticket→dev(구현 엔진)로 인계. track-issue는 분류·인계·이슈 종료만.
2. **값·분류 임의 생성 금지.** 범위·도메인이 애매하면 **한 번에 한 질문**으로 확인.
3. **검수 게이트.** 티켓은 사람이 검수한 뒤에야 구현으로 넘어간다(ticket 규칙 계승).
4. **완료는 사용자 게이트.** 구현이 끝나고 사용자가 "해결했다"고 해야 PR 머지·이슈 종료한다.

## 0. 전제 확인
- `gh` 설치/인증 확인: `gh auth status`. 미설치/미인증이면 알리고 멈춘다 (`https://cli.github.com`, `gh auth login`).
  - `gh` 가 PATH 에 없는 환경이면(예: Windows 기본 설치 위치 `C:\Program Files\GitHub CLI\gh.exe`) 그 실제 경로를 호출 연산자로 풀어 쓴다: `& "<gh 경로>" <args>`.
- 대상 레포는 현재 작업 디렉터리의 remote. 불명확하면 사용자에게 묻는다.
- 파이프라인: `ticket`·`dev` 스킬과 `scripts/implement.ps1`·`templates/ticket.md` 가 이 저장소에 있어야 한다.

## 1. 이슈 선택
- **인자로 번호가 주어지면** 그 이슈를 다룬다.
- **없으면** `gh issue list` 로 열린 이슈 목록을 보여주고 어느 것을 처리할지 고르게 한다.
- 정한 뒤 `gh issue view <번호>` 로 제목·본문(현상·재현·기대/실제)을 읽어 무엇을 고쳐야 할지 파악한다.

## 2. 범위 분류 — dev단 진입점 판정
이슈가 닿는 도메인(`docs/HOME.md`)과 규모를 본다:
- **좁음** (한 도메인·한 티켓으로 닫힘) → 티켓 1장(3단계).
- **넓음** (여러 도메인·새 경계 필요) → 먼저 [decompose](../../../skills/decompose/SKILL.md)(새 도메인 경계·HOME 갱신) 또는 dev가 하위로 분해 → 하위마다 티켓. 순환·경계 모호는 멈추고 안내.
- 어느 도메인·규모인지 애매하면 후보를 객관식으로 **한 번에 한 질문**. 임의 확정 금지.

## 3. 티켓화 — ticket 스킬로 인계 (검수 게이트)
[ticket](../../../skills/ticket/SKILL.md) 절차로 이슈를 자기완결 티켓으로 그린다:
- 산출: `tickets/<fe|be>/NNNN-<slug>.md` ([templates/ticket.md](../../../templates/ticket.md) 기준).
- 프런트매터 `branch` 는 이슈 번호를 반영: **`fix/<번호>-<짧은-slug>`**(kebab-case 3~5단어). `base` 기본 main.
- 티켓 본문·커밋·PR이 이슈를 가리키도록 이슈 번호를 근거로 남긴다(구현 커밋 `Refs #<번호>`, 최종 PR `Closes #<번호>`).
- **티켓만 쓴다 — 여기서 코드도 엔진 호출도 안 한다.** 티켓은 사람이 검수한다.

## 4. 구현 — dev / implement 엔진 (검수 후)
티켓 검수가 끝나면 그 티켓만 구현한다(track-issue가 코드를 직접 쓰지 않는다):
```
pwsh "scripts/implement.ps1" -Side <be|fe> -Ticket tickets/<be|fe>/NNNN-<slug>.md
```
또는 [dev](../../../skills/dev/SKILL.md)로 그 티켓 1개를 계약서로 구현. `base`에서 `branch`(fix/<번호>-…)를 따 구현하고,
커밋 메시지 본문에 `Refs #<번호>` 를 남긴다. 전역 규칙대로 AI 귀속 표기 없음. push 는 5단계 사용자 확인 후.

## 5. PR로 머지 — 사용자 확인 게이트
**사용자가 "해결했다"(또는 동등한 확인)라고 말하기 전에는 닫지도 머지하지도 않는다.**

확인을 받으면 **PR 방식으로 머지한다**(기본·고정 경로). 이 확인이 push 허가를 겸한다:

1. **push** — 구현 브랜치를 origin에 올린다: `git push -u origin fix/<번호>-<slug>`.
2. **PR 생성** — `gh pr create --base <기본브랜치> --head <브랜치> --title "…" --body "…"`.
   - **PR 본문에 `Closes #<번호>` 를 반드시 박는다** — 머지되는 순간 이슈가 자동 종료되게 하는 게 이 스킬의 핵심이다. (본문에도 AI 귀속 표기 없음.)
3. **squash 머지** — `gh pr merge <PR번호> --squash --delete-branch` (`--squash` 기본, 사용자가 다른 방식을 명시하면 따른다).
4. **자동 종료 확인** — `gh issue view <번호>` 로 닫혔는지 확인. 어떤 이유로든 안 닫혔으면 `gh issue close <번호>`.
5. **보고** — 티켓 경로, 머지된 PR URL, 닫힌 이슈, 삭제된 브랜치, 최신화된 기본 브랜치를 보고한다.

머지·푸시 같은 되돌리기 어려운 동작은 실행 전에 한 줄로 무엇을 할지 알리고 진행한다.

## 하지 않는 것
- 이슈를 직접 고치기 — ticket→dev로 인계(안내데스크).
- 범위·도메인·값 임의 생성 — 애매하면 한 번에 한 질문.
- 티켓 검수 전 구현 / 사용자 확인 전 머지·push·이슈 종료.
