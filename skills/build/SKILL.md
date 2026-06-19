---
name: build
description: 구현 단계 진입점. 구체화된 FE/BE 도메인 폴더(docs/fe/*/·docs/be/*/)를 빠르게 게이트 점검한 뒤, 오케스트레이터 에이전트 desk에게 분류·wave 편성·디스패치를 맡긴다. desk가 도메인을 기획/구현 트랙으로 갈라 역할 에이전트(plan/dev)를 wave별로 돌린다(구현은 한 종류 dev가 BE·FE 계약을 모두 처리). "도메인 구현하자", "빌드하자", "구현 시작", "서브에이전트 돌려", "build" 류에 사용.
---

# build — 구현 단계 진입점

구체화된 도메인을 **역할별 에이전트로 구현**시키는 진입점. 실제 분류·wave 편성·디스패치는 오케스트레이터 에이전트 [desk](../../agents/desk.md)가 한다. 전제: [plan-fe](../plan-fe/SKILL.md)/[plan-be](../plan-be/SKILL.md)로 도메인 폴더 구체화 + [arch](../arch/SKILL.md)로 패턴·아키텍처 확정 + 사람이 슬롯 채움. 규약 SoT: `docs/arch/ARCHITECTURE.md`.

## 흐름
1. **빠른 게이트** — `docs/HOME.md`·`docs/fe/*/`·`docs/be/*/`를 훑어 `[입력 필요]` 슬롯이 남은 도메인이 있으면 짚고, 사람에게 채울지(→ plan 기획 트랙) 그대로 진행할지 확인한다. 참조 그래프에 순환이 보이면 멈추고 decompose로 경계 재검토를 안내한다.
2. **오케스트레이터 위임** — `Agent`(subagent_type: `desk`)를 띄워 분류·wave 편성·디스패치를 맡긴다. desk가:
   - 도메인을 **기획 → plan / 구현(BE·FE) → dev** 트랙으로 분류(계약이 BE/FE를 선언하므로 구현 에이전트는 한 종류),
   - 참조 그래프로 wave를 묶어(BE 먼저 → FE) 역할 에이전트를 병렬 디스패치,
   - wave 마감마다 도메인 폴더 상태·`일지.md`·HOME 표를 갱신한다(일지는 쓰기만).
3. **대안 백엔드(헤드리스)** — Agent 병렬 대신 도메인을 통째로 헤드리스 엔진에 맡기려면 도메인별로 안내(직접 실행 금지 — 검수 게이트 보존):
   ```
   pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side be -Domain <name>
   pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side fe -Domain <name>
   ```

## 종료
완료/미완/보류 도메인 + 트랙(기획/BE/FE)별 상태 요약. 미완은 막힌 이유 1줄씩. push는 사람이. 한국어 + 마크다운, 식별자 영문.
