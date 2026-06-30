---
kind: <fe | be>           # FE(플로우+표현) / BE(데이터+기능)
status: not-started       # not-started → in-progress → done
pattern: <TS | DM>        # BE 도메인만 — arch가 채움. FE는 비움
depends: []               # 참조하는 도메인 slug (FE→BE, BE→BE)
# code: src/<slug>        # (선택) 이 도메인 구현 코드 위치. 기본 src/<slug>, 다를 때만 명시 — Tier B 코드 골격 추출 대상
# --- implement.ps1 헤드리스 백엔드용 (선택, Agent 병렬이면 비워둬도 됨) ---
branch: feat/<slug>
base: main
engine: codex             # codex | claude
---

# <DOMAIN_NAME>

*이 도메인이 무엇을 책임지는지 한 줄.*

## 구성
*FE면 요소 목록(요소/<노드>.md 링크), BE면 데이터.md + 기능 목록.*

## 패턴 (BE 도메인만)
*ARCHITECTURE §패턴 정책 기본값. arch가 채운다.*
- 채택: *[입력 필요: arch에서 결정 — TS/DM + 왜]*

## 책임지지 않는 것
*인접 도메인이 맡는 것 — 경계 명시.*
