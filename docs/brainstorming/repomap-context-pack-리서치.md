# 리서치 — DDD 위키를 "repomap"화: 도메인 컨텍스트 팩 자동 주입

**질문(요지):** DDD로 짜인 위키를 Aider의 *repomap*처럼 만들어서, 특정 도메인까지 바로 도달하면서 그와 관련된 내용을 **압축해 자동으로 LLM에 보내는** 방법.

**결론(한 줄):** 이 프레임워크는 repomap이 tree-sitter로 *추론*하는 의존 그래프를 이미 `HOME.md ## 참조 그래프`로 **선언**해 두고 있다. 그래서 코드 파싱 없이 *선언된 DAG를 순회*하고, **그래프 거리별로 압축 강도를 달리한 "도메인 컨텍스트 팩"** 을 생성기로 뽑아 서브에이전트에 주입하면 된다. tree-sitter·임베딩 인덱스는 불필요하다.

---

## 1. Aider repomap이 하는 일 (외부 레퍼런스)

Aider의 repo map은 "전체 코드를 넣지 말고, 예산에 맞춘 *랭킹된 지도*를 넣는다"는 아이디어의 표준 구현이다. 파이프라인:

1. **태그 추출(tree-sitter).** 각 파일을 파싱해 `name.definition.*`(def)과 `name.reference.*`(ref) 캡처를 뽑는다. → 심볼 정의/참조 목록.
2. **의존 그래프 + PageRank.** 파일을 노드로, "A가 B에 정의된 심볼을 참조" 를 A→B 간선으로 하는 `MultiDiGraph`를 만들고 **PageRank**(personalization: 지금 작업 중인 파일·언급된 심볼에 가중)로 파일·태그 중요도를 랭킹한다.
3. **토큰 예산 = 이진 탐색.** 랭킹 상위 태그를 N개 포함시켜 렌더 → 토큰 측정 → 예산(`--map-tokens`, 기본 1k)에 맞는 최대 N을 **이진 탐색**으로 찾는다.
4. **본문 말고 스켈레톤.** 함수/클래스 **시그니처·헤더만** 보이고 본문은 `...`로 생략. 결과는 mtime 기반 디스크 캐시.

→ 핵심 3요소: **(a) 의존 그래프, (b) 거리/중요도 랭킹, (c) 예산 맞춘 스켈레톤화.** 우리는 (a)를 공짜로 갖고 있다.

비교 축 — **front-load vs lazy retrieval.** Claude Code는 벡터 인덱스를 버리고 *agentic search*(디렉토리·파일명을 먼저 보고 grep/read로 필요할 때 당김)를 택했다 — 인덱스 staleness·보안·신뢰성 실패모드를 없앤다. Cursor는 반대로 임베딩 인덱스+grep 하이브리드(1000파일 넘으면 정확도 우위). GraphRAG는 엔티티 그래프를 만들고 커뮤니티별 LLM 요약을 계층으로 쌓아 local/global 검색. (출처: §끝.)

---

## 2. 왜 이 프로젝트가 repomap에 *더* 유리한가

repomap이 어렵게 푸는 문제 대부분이 우리 규약에서 이미 해결돼 있다:

| repomap이 추론으로 푸는 것 | 우리 위키에서는 |
|---|---|
| 심볼 def/ref를 tree-sitter로 추출 | 도메인 경계가 **폴더 1개 = 노드 1개**로 이미 분리 |
| 참조 그래프를 심볼 매칭으로 *추론* | `HOME.md ## 참조 그래프`에 **선언**(FE→BE, BE→BE, 단방향·비순환) — 단일 소스, 갱신이 하드 규약 |
| 무엇이 중요한지 PageRank로 *추정* | 참조 그래프로 중심성 계산이 **결정적**(추정 아님) |
| 본문에서 시그니처를 골라냄 | 템플릿 구조가 고정(데이터.md=M, 기능_*.md=C 5섹션, 요소=V) → 시그니처 섹션이 **이미 명명**됨 |
| 노이즈(로그·주석) 배제 | `일지.md`는 **write-only**(읽지 않음) — 검색 단계에서 이미 제외 |
| 인덱스 staleness | HOME에서 매번 재생성 → **인덱스 없음**(Claude Code 철학과 동일) |

즉 **tree-sitter도 임베딩도 필요 없다.** 선언된 DAG를 순회 + 거리별 압축 + 예산 맞춤 = repomap의 효과를 더 단순·결정적으로 얻는다.

또한 이 동작은 *이미 비공식적으로 존재*한다 — `dev`의 「시작 전 읽기」가 "배정 계약 + ARCHITECTURE + 의존 도메인 읽기(읽기만)"를 한다. 본 제안은 그 수작업을 **생성기로 형식화·압축**하는 것.

---

## 3. 제안 — "도메인 컨텍스트 팩" 생성기

입력: 타깃 도메인 slug(예: `fe/checkout`) + 예산(토큰) + 모드. 출력: 압축된 단일 마크다운 팩(또는 지도).

### 3.1 직접 도달(인덱스)
`HOME.md`의 FE/BE 표 → `slug → 폴더경로` 맵. `## 참조 그래프` → 인접 리스트(DAG). 한 번 파싱하면 임의 도메인에 O(1) 도달.

### 3.2 관련 내용 모으기(그래프 순회)
- **하류(타깃이 *필요로* 하는 것)**: 타깃에서 FE→BE, BE→BE 간선을 **정방향 전이 순회**. 구현자가 지켜야 할 계약들. (구현 시 주 관심.)
- **상류(타깃을 *부르는* 것 = 영향 범위)**: **역방향 간선** 순회. 변경 접수(intake)·리팩터 시 영향 분석용.
- **홉 거리로 경계**(기본 깊이 2). 순환은 규약상 없어야 하므로 발견 시 경고.

### 3.3 거리별 압축 티어 (repomap 스켈레톤화의 직역)
| 티어 | 대상 | 포함 내용 |
|---|---|---|
| **T0** 타깃 | 타깃 도메인 | 폴더 **전문**(README + 데이터/플로우 + 기능/요소). `일지.md` 제외 |
| **T1** 직접 의존 | 1홉 이웃 | **인터페이스 스켈레톤만** — BE: `데이터.md` 테이블/enum 헤더 + 각 `기능_*.md`의 **§입력·§출력**(§처리 본문 제거). FE: 요소 §호출하는 기능 목록 |
| **T2+** 전이 의존 | 2홉 이상 | HOME 표의 **한 줄 역할 요약만** |
| — 항상 제외 | 전 도메인 | `일지.md`(write-only) |

이것이 Aider의 "시그니처만, 본문은 `...`"의 위키판이다. T1을 시그니처로 줄이는 게 토큰 절감의 핵심(repomix 보고 ~70% 절감과 같은 메커니즘).

### 3.4 랭킹·예산
- 예산 초과 시: **거리 우선**(T0 > T1 > T2), 동순위는 **중심성**(선언 그래프 위 PageRank — 값싸고 결정적)으로 가름.
- Aider식 **이진 탐색**(포함 노드 prefix를 늘려가며 예산에 맞추기) 또는 랭크순 greedy fill.
- 헤드리스 기본 예산 제안: 타깃 전문 + 1홉 인터페이스가 들어갈 정도(예 4~8k). 대화형은 더 작게(지도만).

### 3.5 자동 주입(전달 모드) — 2안
- **A. 프론트로드 팩**: 생성기가 위 티어를 이어붙인 단일 마크다운을 만들어 서브에이전트 프롬프트/`implement.ps1`에 주입. 헤드리스·결정적 실행에 적합.
- **B. 점진 공개(progressive disclosure, 권장 하이브리드)**: 처음엔 **지도 + T1 인터페이스 스켈레톤만** 주입하고, 서브에이전트가 필요할 때 특정 노드 폴더를 직접 read해 확장. 도메인이 작고 그래프가 선언돼 있어 지도가 작으므로, 풀 RAG가 거의 필요 없다 — Claude Code의 agentic-search 철학과 일치. **현재 `dev` 시작 전 읽기를 이 모드로 형식화**하는 게 가장 자연스럽다.

→ 권장: 대화형/dev는 **B(지도+스켈레톤, 온디맨드 확장)**, `implement.ps1` 헤드리스는 **A(완결 팩)**.

---

## 4. 추가해야 할 산출물(구체)

1. **`scripts/context-pack.ps1`(또는 `.mjs`)** — `-Domain fe/checkout [-Depth 2] [-Budget 6000] [-Mode pack|map] [-Direction down|up|both]`. HOME 파싱 → 그래프 순회 → 티어 압축 → 예산 맞춤 → 마크다운 출력(stdout). 인덱스 없음, 매 호출 HOME에서 재생성.
2. **규약 추가: "인터페이스 섹션" 계약** — 스켈레톤화를 기계적으로 하려면 어떤 섹션이 *시그니처(T1 유지)* 이고 어떤 게 *본문(T1 제거)* 인지 못박아야 한다. 기능 템플릿 5섹션 중 **§입력·§출력 = 인터페이스**, §처리·예외 = 본문. `데이터.md`는 테이블/enum **헤더 = 인터페이스**. (`templates/기능.md`·`데이터.md`에 마커 주석 한 줄로 표시.)
3. **(선택) HOME enrichment** — 도메인별 토큰 비용·중심성을 미리 계산해 HOME 표 컬럼에 적어두면 예산 산정이 즉시(캐시 대용). 단 staleness 위험 — 온디맨드 재계산이 더 안전.
4. **연결점** — `dev`·`desk`·`intake`의 「시작 전 읽기」가 ad-hoc 읽기 대신 이 생성기를 부르도록 한 줄로 교체(또는 얇은 `context` 스킬 신설).

---

## 5. 기존 규약과의 시너지(이미 압축의 절반은 돼 있음)

- **`일지.md` write-only** = 검색 단계 제외(노이즈 배제)를 규약이 이미 강제.
- **`distill`(가지치기)** = *작성 시점* 요약 — "핵심 문장만 남기고 결정이력은 일지로". 본 생성기는 *검색 시점* 스켈레톤화·예산화를 더한다(두 층이 직교·상보).
- **HOME 단일 소스** = 유지보수되는 그래프가 공짜.
- **세분할(위키-정렬 granularity)** = 노드가 작아 티어 압축의 입자가 곱다.

---

## 6. 결정 갈림길(사람 확인 필요)

1. **생성기 언어**: `implement.ps1`이 PowerShell이니 일관성 위해 `.ps1`? 아니면 파싱 편의로 `bin/`처럼 `.mjs`? (권장: HOME 마크다운 파싱은 JS가 편함 → `.mjs`, ps1에서 호출.)
2. **전달 기본 모드**: dev를 점진 공개(B)로 형식화 vs 완결 팩(A) 고정. (권장: B 기본, 헤드리스만 A.)
3. **인터페이스 섹션 마커 방식**: 섹션 제목 고정 계약만으로 충분 vs HTML 주석 마커(`<!-- iface -->`) 추가.
4. **중심성 사용 여부**: 도메인 수가 적으면 거리 티어만으로 충분 — PageRank는 그래프가 커질 때만.

---

## 부록 — 외부 출처
- Aider repomap: https://aider.chat/2023/10/22/repomap.html · https://aider.chat/docs/repomap.html · https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system
- repomix(스켈레톤 압축·토큰 트리): https://repomix.com/ · https://repomix.com/guide/usage
- Claude Code agentic search(인덱스 미사용): https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start · https://vadim.blog/claude-code-no-indexing/
- Cursor 시맨틱+grep 하이브리드: https://cursor.com/docs/agent/tools/search · https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/
- Microsoft GraphRAG(그래프+커뮤니티 요약): https://microsoft.github.io/graphrag/
- 점진 공개(progressive disclosure): https://www.mindstudio.ai/blog/progressive-disclosure-ai-agents-context-management
