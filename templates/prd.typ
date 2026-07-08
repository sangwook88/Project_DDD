// PRD (외부 공개용 제품 조망) — Typst 템플릿
// prd 스킬이 이 템플릿을 근거 문서로 채워 docs/PRD.typ 를 저작한다.
// 렌더: typst compile docs/PRD.typ  (→ docs/PRD.pdf)
//
// 규약(계승):
//  - AI는 값을 짓지 않는다. 근거 없는 칸은 지우지 말고 slot(...) 으로 남긴다.
//  - 내부 도메인명·패턴을 노출하지 않는다 — 사용자 가치 문장으로 번역.
//  - 도식은 근거(로드맵·HOME 참조 그래프·플로우)를 시각화할 뿐, 없는 관계를 그리지 않는다.

#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

// ── 프리앰블(문서 스타일) ─────────────────────────────────────────────
#set page(paper: "a4", margin: 2.2cm, numbering: "1")
// Latin = New Computer Modern(typst 번들), 한글 = Malgun Gothic 폴백.
// 한글 폰트가 다른 환경이면 두 번째 값을 그 환경 폰트로 바꾼다(예: "Noto Sans KR").
#set text(font: ("New Computer Modern", "Malgun Gothic"), size: 10.5pt, lang: "ko")
#set par(justify: true, leading: 0.7em)
#set heading(numbering: none)
#show heading.where(level: 1): set text(size: 15pt)
#show heading.where(level: 2): it => block(above: 1.4em, below: 0.7em, text(size: 12pt, it))

// 근거 없는 칸을 채우지 말고 이 슬롯으로 남긴다(빨간 표시 = 사람이 채울 곳).
#let slot(msg) = text(fill: rgb("#c0392b"))[*[입력 필요: #msg]*]

// 도식 공통 노드 스타일
#let box-fill = luma(244)

// ── 표지 ─────────────────────────────────────────────────────────────
#align(center)[
  #text(size: 22pt, weight: "bold")[제품명]  // ← 제품명(한국어)
  #v(0.4em)
  #text(size: 12pt, fill: luma(90))[
    제품 한 줄 요약: 누구의 어떤 문제를, 어떻게 해결하는 제품인가
  ]
]
#v(1.2em)
#line(length: 100%, stroke: 0.5pt + luma(200))
#v(0.6em)

// ── 해결하는 문제 ────────────────────────────────────────────────────
== 해결하는 문제
- 외부 독자가 공감할 문제 서술 — 내부 용어 없이.

// ── 타깃 사용자 · 페르소나 ───────────────────────────────────────────
== 타깃 사용자 · 페르소나
- *주 사용자*: 누구 — 상황·니즈.
- *페르소나*: #slot[대표 사용자 상] // 근거 없으면 슬롯 유지

// ── 핵심 가치 · 차별점 ───────────────────────────────────────────────
== 핵심 가치 · 차별점
- *핵심 가치*: 이 제품이 주는 가치.
- *차별점*: 기존 대안 대비 — 리서치 근거 있으면 출처, 없으면 #slot[차별점 근거].

// ── 주요 기능 (범위 In/Out) ──────────────────────────────────────────
== 주요 기능
#table(
  columns: (1fr, 1fr),
  inset: 8pt,
  align: left + top,
  stroke: 0.5pt + luma(180),
  table.header(
    [*범위 In (현재 타깃 버전 vN)*],
    [*범위 Out (지금 안 함 / 다음)*],
  ),
  [• 기능 A — 사용자 가치로 서술], [• 기능 B — 다음 버전 또는 YAGNI 사유],
)

// 도메인·기능 관계도 — HOME 참조 그래프(FE→BE)를 사용자 가치 라벨로 번역.
// 없는 엣지를 그리지 않는다. 사각형=화면/기능(FE), 원=제공 능력(BE).
#figure(
  diagram(
    node-stroke: 0.6pt,
    spacing: (5em, 2.2em),
    node((0, 0), [주문 화면], shape: rect, fill: box-fill),
    node((0, 1), [장바구니], shape: rect, fill: box-fill),
    node((2, 0), [결제], shape: circle, fill: box-fill),
    node((2, 1), [재고], shape: circle, fill: box-fill),
    edge((0, 0), (2, 0), "->", [결제]),
    edge((0, 1), (2, 1), "->", [재고 확인]),
  ),
  caption: [기능 관계도 — 화면이 부르는 제품 능력],
)

// ── 핵심 사용자 흐름 ─────────────────────────────────────────────────
== 핵심 사용자 흐름
// FE 플로우(docs/fe/*/플로우.md)를 근거로 대표 여정 1~2개만. 시작·끝 = 둥근 노드.
#figure(
  diagram(
    node-stroke: 0.6pt,
    spacing: 3em,
    node((0, 0), [시작], corner-radius: 10pt, fill: box-fill),
    edge("->"),
    node((1, 0), [상품 선택]),
    edge("->"),
    node((2, 0), [결제]),
    edge("->"),
    node((3, 0), [완료], corner-radius: 10pt, fill: box-fill),
  ),
  caption: [핵심 사용자 흐름],
)

// ── 성공 지표 ────────────────────────────────────────────────────────
== 성공 지표
// 로드맵/브리프에 지표가 없으면 표를 짓지 말고 아래 슬롯만 남긴다.
#slot[측정 지표 — 로드맵/브리프에 없으면 짓지 않는다]
// (근거가 있으면 표로:)
// #table(
//   columns: (2fr, 1fr, 1fr),
//   table.header([*지표*], [*현재*], [*목표*]),
//   [활성 사용자], [—], [—],
// )

// ── 로드맵 요약 ──────────────────────────────────────────────────────
== 로드맵 요약
// 버전 타임라인 — roadmap.md 의 v1→vN. 현재 타깃 버전을 강조.
#figure(
  diagram(
    node-stroke: 0.6pt,
    spacing: 3.2em,
    node((0, 0), [v1\ (현재)], shape: rect, corner-radius: 4pt, fill: rgb("#eaf2fb")),
    edge("->"),
    node((1, 0), [v2], shape: rect, corner-radius: 4pt, fill: box-fill),
    edge("->"),
    node((2, 0), [v3], shape: rect, corner-radius: 4pt, fill: box-fill),
  ),
  caption: [버전 타임라인],
)
#v(0.4em)
#table(
  columns: (auto, 1.4fr, 1.4fr),
  inset: 8pt,
  align: left + top,
  stroke: 0.5pt + luma(180),
  table.header([*버전*], [*목표(가치)*], [*핵심*]),
  [v1 (현재)], [한 줄], [기능],
  [v2…], [한 줄], [기능],
)
