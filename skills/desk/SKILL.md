---
name: desk
description: 기획 전단의 "비서" — 사용자가 무슨 말을 하면 프로젝트 상태(브리프/sketch 목업/HOME/FE·BE 도메인/ARCHITECTURE/티켓)와 발화 의도를 보고 지금이 어느 단계인지 판정해 알맞은 단계 스킬(brainstorm/sketch/roadmap/decompose/plan-fe/plan-be/distill/arch/ticket)로 안내·인계하는 메인 스레드 라우터. 단계 작업 자체는 하지 않고 값도 짓지 않는다. "뭐부터 하지", "이거 어디 단계야", "다음 뭐 해", "기획 시작" 류에 사용.
---

# desk — 기획 전단 라우터 (비서)

기획 전단 7단계의 **진입점·안내데스크**. 사용자 발화 + 프로젝트 상태를 보고 **지금 단계**를 판정해 해당 단계 스킬로 인계한다. 규약: [docs/conventions.md](${DDD_ROOT}/docs/conventions.md).

## 절대 규칙
1. **단계 작업을 직접 하지 않는다.** 분할·명세·티켓 등은 해당 스킬로 인계, 데스크는 판정·안내만.
2. **값 생성·산출물 편집 금지.**
3. **모호하면 한 번에 한 질문.** 발화 의도가 갈리면 후보 단계를 객관식으로 확인.

## 상태 스캔 (인계 전)
가볍게 확인해 진행 지점을 가늠한다:
- `docs/brainstorming/*-brief.md` — brainstorm 산출(설계 브리프).
- `docs/roadmap.md` — roadmap 산출(버전 로드맵 + 현재 타깃 버전).
- `docs/HOME.md` — decompose 산출(FE/BE 지도).
- `docs/fe/*/`·`docs/be/*/` — plan-fe/plan-be 산출 + 슬롯 충실도 + 가지치기 여부(distill).
- `docs/brainstorming/*-sketch.html` — sketch 산출(비전 목업).
- `docs/arch/ARCHITECTURE.md` — arch 산출.
- `tickets/*.md` — ticket 산출.

## 라우팅 표 (상태 → 단계)
| 상태 | 다음 단계 | 스킬 |
|---|---|---|
| 브리프 없음 / 막연한 아이디어 | ① 브레인스토밍 | [brainstorm](../brainstorm/SKILL.md) |
| 브리프 있고 sketch 안 함 | ② 비전 합맞춤(목업) | [sketch](../sketch/SKILL.md) |
| sketch(또는 브리프) 있고 roadmap 없음 | ③ 버전 로드맵 | [roadmap](../roadmap/SKILL.md) |
| roadmap 있고 HOME 없음 | ④ 도메인 분할(현재 타깃 버전) | [decompose](../decompose/SKILL.md) |
| HOME 있고 도메인 폴더 비었음 | ⑤ FE+BE 코스펙(sketch 있으면)·FE 먼저(없으면) | [plan-fe](../plan-fe/SKILL.md) (+ [plan-be](../plan-be/SKILL.md) 짝) |
| FE 됐고 BE 비었음(FE-first 폴백) | ⑤ BE 도출 | [plan-be](../plan-be/SKILL.md) |
| 폴더 채웠으나 가지치기 안 함 | ⑥ 가지치기·정제 | [distill](../distill/SKILL.md) |
| 가지쳤고 ARCHITECTURE 없음 | ⑦ 기술·구조 결정 | [arch](../arch/SKILL.md) |
| 아키텍처 확정 후 티켓 없음 | ⑧ 구현 티켓 | [ticket](../ticket/SKILL.md) |
| 티켓 검수 끝 | (현재 버전 전단 종료) | `pwsh "${DDD_ROOT}/scripts/implement.ps1" -Side <be\|fe> -Ticket …` (기존 구현) |

⑤ 구체화는 **sketch 기반 코스펙** — sketch 목업이 있으면 plan-fe·plan-be를 **sketch를 공유 소스로 짝지어** 한 패스에 깐다(FE=호출자 플로우/요소, BE=호출 대상 데이터/기능). **sketch가 없으면 FE-first 폴백** — plan-fe로 FE를 먼저 끌어내고 그 호출에서 plan-be로 BE를 도출(둘 다 비면 plan-fe 먼저). 한 축만 막혔으면 그 축 스킬로. 어느 경로든 참조는 FE→BE 단방향이고 BE는 타이밍을 모른다. (구현 순서 BE-first는 별개 — dev가 처리.) 모든 단계는 roadmap의 **현재 타깃 버전** 범위 안에서 돈다 — 그 버전을 다 출시했으면 roadmap에서 타깃을 올린 뒤 ④부터 다시.

- 발화 의도가 상태와 어긋나면(예: "다시 도메인 가르자") **발화 우선**. 단, 앞 단계 산출물을 덮어쓰는 인계면 1회 확인.
- 데스크는 자동 순회하지 않고 다음 한 단계만 인계한다.

## 인계 형식
"지금은 **<단계>** 입니다 → `<skill>` 스킬로 진행합니다" 한 줄 + 그 스킬에 넘길 입력(브리프/도메인 경로 등) 명시. 한국어 + 마크다운.
