# Notion REST 도구 (`notion.py`)

토큰(REST) 하나로 Notion 의 **회의록 DB** 와 **Task 칸반보드(작업 현황)** 를 다룬다.
`meeting-summary` · `new-task` · `track-task` 스킬이 이 도구를 호출한다. MCP 없이 REST 단일 —
근거 딥링크(블록 앵커)가 REST 로만 저장되기 때문.

## 준비 (1회)

```powershell
python -m pip install -r requirements.txt        # requests
copy .env.example .env                            # 값 채우기 (아래)
```

1. `notion.so/my-integrations` 에서 인티그레이션 생성 → Internal Integration Secret 을 `.env` 의 `NOTION_TOKEN` 에.
2. 다룰 DB(회의록·칸반)의 페이지 ••• → **연결(Connections)** → 그 인티그레이션 추가 (없으면 REST 가 못 본다).
3. DB id 채우기:
   - `python notion.py list-dbs` — 인티그레이션에 공유된 DB/데이터소스 id 나열 → `NOTION_DB_ID`(회의록).
   - `python notion.py kanban-info --url "<칸반 보드 URL>"` — 칸반 DB id·상태 컬럼 확인 → `NOTION_KANBAN_DB_ID`.

`.env` 는 이 폴더(`notion.py` 옆)에 둔다. `NOTION_TOKEN` 은 필수, 나머지는 쓰는 명령에 맞춰 채운다.

## 명령

### 회의록 DB — `meeting-summary` 가 사용
```powershell
python notion.py create-meeting "<제목>" summary.md tasks.json [--dry] [--date YYYY-MM-DD] [--people id1,id2,...]
python notion.py replace-tasks <회의록 page_id> tasks.json     # 기존 페이지 태스크 묶음만 교체(요약 보존)
python notion.py archive <page_id> [...]                       # 페이지를 휴지통으로(복원 가능)
```
- `summary.md` = 요약 마크다운(`# 개요 / ## 결정사항 / ## 액션아이템 / ## 미결·추후`).
- `tasks.json` = `{"groups":[{title, owner, track, status, target, details:[...], basis?:{label,kind,idx}}, ...]}`.
  태스크를 표로 잘게 늘어놓지 않고 큰 제목(`title`) 묶음 + 세부 bullet 로 렌더한다.
  묶음이 없으면 `{"groups": []}` 로 두면 요약만 기재된다.
- `basis`(근거)는 생성 후 결정/미결 블록 딥링크로 자동 승격된다(`kind`=결정|미결, `idx`=문서 번호).
- `--dry` 로 POST 없이 블록 JSON 만 검사할 수 있다.

### Task 칸반보드 — `new-task`/`track-task` 가 사용
```powershell
python notion.py kanban-info --url "<칸반 보드 URL>"           # 1회: 제목·상태(컬럼)·사람 속성 확인
python notion.py list-cards [--status "시작 전"]               # 카드 목록(제목·상태·url·page_id)
python notion.py create-card "<제목>" [--body-file body.md] [--status "시작 전"] [--assignee id1,id2] [--basis-url u --basis-label l]
python notion.py create-cards cards.json                       # 배치 생성
python notion.py move-card <page_id> "완료"                    # 상태(컬럼) 이동
```
- `cards.json` = `{"cards":[{title, body?, status?, assignee_ids?, basis_url?, basis_label?}, ...]}` (status 기본 = 시작 전).
- 상태 속성은 스키마에서 `status`/`select` 타입으로 **자동감지**하고, 제목·사람 속성도 타입으로 찾는다 —
  속성 이름을 하드코딩하지 않는다. 컬럼명이 `시작 전/진행 중/완료` 와 다르면 `kanban-info` 가 실제 옵션명을 알려준다.

## 메모
- 제목·상태·사람 속성 키는 DB 마다 다르므로(Name/제목 · 상태/Status) 스키마 타입으로 탐지한다.
- rich_text 2000자, 페이지 children 100블록 상한을 배치로 우회한다.
- 회의 오디오 전사(STT)는 이 도구에 포함되지 않는다 — `meeting-summary` 는 전사된 텍스트를 입력으로 받는다.
