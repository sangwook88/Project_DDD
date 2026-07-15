"""Notion REST — 회의록 DB 기재 + Task 칸반보드(작업 현황) 카드 조작.

    POST  /v1/pages                          페이지 생성(children 최대 100블록)
    PATCH /v1/blocks/{id}/children           나머지 블록 추가(배치)
    PATCH /v1/pages/{id}                      속성(상태 등) 변경
    POST  /v1/data_sources/{id}/query        카드 목록 조회
    GET   /v1/databases/{id}                  제목 속성 이름 탐색

제목·상태 속성 키는 DB 마다 다르다(Name/제목/이름 · 상태/Status). 하드코딩하지 않고
스키마에서 타입(title / status·select / people)으로 찾아 쓴다. rich_text 2000자, 100블록 상한.

명령: create-meeting · replace-tasks · archive (회의록 DB — .env 의 NOTION_DB_ID)
      kanban-info · create-card · create-cards · move-card · list-cards (칸반보드 — .env 의 NOTION_KANBAN_DB_ID)
      list-dbs (인티그레이션에 공유된 DB 검색)
DB ID 를 못 채웠으면 kanban-info --url / list-dbs 로 찾아 .env 에 넣는다.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

API = "https://api.notion.com/v1"
VERSION = "2026-03-11"
MAX_BLOCKS = 100
MAX_TEXT = 2000

# 회의록(회의내역) DB ID 는 .env 의 NOTION_DB_ID 에서 읽는다. 프로젝트마다 다르므로 하드코딩하지 않는다.
# 못 채웠으면 `python notion.py list-dbs` 로 인티그레이션에 공유된 DB 를 찾아 넣는다.
REVIEW_TODO = "검수 확인 — 체크하면 이 태스크들을 칸반에 반영"

# Task 칸반보드(작업 현황) 상태 컬럼. 신규 카드는 시작 전, 완료 보고 건은 완료.
KANBAN_TODO = "시작 전"
KANBAN_DOING = "진행 중"
KANBAN_DONE = "완료"

_ID_RE = re.compile(r"[0-9a-fA-F]{32}")


class NotionError(RuntimeError):
    pass


class Notion:
    def __init__(self, token: str, database_id: str) -> None:
        if not token or not database_id:
            raise NotionError("NOTION_TOKEN / NOTION_DB_ID 가 비어 있습니다 (.env 확인).")
        self.token = token
        self.db = database_id
        self._ds_cache: str | None = None
        self._schema_cache: dict | None = None

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        }

    def _req(self, method: str, path: str, body: dict | None = None) -> dict:
        r = requests.request(method, f"{API}{path}", headers=self._headers, json=body, timeout=30)
        if not r.ok:
            raise NotionError(f"{method} {path} 실패 {r.status_code}: {r.text[:500]}")
        return r.json()

    def _data_source_id(self) -> str:
        """API 2025-09-03+ 는 DB 가 data source 컨테이너. GET /databases 로 소스 ID 를 뽑는다.
        data_sources 가 없는 구버전 워크스페이스면 DB ID 자체를 소스로 쓴다."""
        if self._ds_cache:
            return self._ds_cache
        db = self._req("GET", f"/databases/{self.db}")
        sources = db.get("data_sources") or []
        self._ds_cache = sources[0]["id"] if sources else self.db
        return self._ds_cache

    def _page_parent(self) -> dict:
        ds = self._data_source_id()
        if ds != self.db:
            return {"type": "data_source_id", "data_source_id": ds}
        return {"type": "database_id", "database_id": self.db}

    def _schema(self) -> dict:
        if self._schema_cache is None:
            ds = self._data_source_id()
            self._schema_cache = self._req("GET", f"/data_sources/{ds}") if ds != self.db \
                else self._req("GET", f"/databases/{self.db}")
        return self._schema_cache

    def _prop_by_type(self, ptype: str) -> str | None:
        """스키마에서 주어진 타입(title/date/people 등)의 첫 속성 이름. 없으면 None."""
        for name, prop in self._schema().get("properties", {}).items():
            if prop.get("type") == ptype:
                return name
        return None

    def _title_prop(self) -> str:
        name = self._prop_by_type("title")
        if not name:
            raise NotionError("DB 에 title 속성이 없습니다.")
        return name

    def extra_props(self, date: str | None, people_ids: list[str] | None) -> dict:
        """날짜(date 타입)·참석자(people 타입) 속성을 이름 자동감지로 채운다. 값 없으면 생략."""
        props: dict = {}
        if date:
            dprop = self._prop_by_type("date")
            if dprop:
                props[dprop] = {"date": {"start": date}}
        if people_ids:
            pprop = self._prop_by_type("people")
            if pprop:
                props[pprop] = {"people": [{"object": "user", "id": i} for i in people_ids]}
        return props

    def create_meeting_page(self, title: str, markdown: str) -> str:
        """요약 마크다운을 블록으로 변환해 페이지를 만든다. 페이지 URL 반환."""
        title_prop = self._title_prop()
        blocks = markdown_to_blocks(markdown)

        page = self._req("POST", "/pages", {
            "parent": self._page_parent(),
            "properties": {title_prop: {"title": [_text(title[:MAX_TEXT])]}},
            "children": blocks[:MAX_BLOCKS],
        })
        page_id = page["id"]

        for i in range(MAX_BLOCKS, len(blocks), MAX_BLOCKS):
            self._req("PATCH", f"/blocks/{page_id}/children", {"children": blocks[i:i + MAX_BLOCKS]})

        return page.get("url", f"https://notion.so/{page_id.replace('-', '')}")

    # ── Task 칸반보드(작업 현황) ─────────────────────────────────────────
    # 회의록 DB 와 달리 상태(status/select) 속성으로 컬럼을 가르는 보드.
    # 상태 속성 이름·옵션은 하드코딩하지 않고 스키마에서 타입으로 찾는다
    # (status 타입 우선, 없으면 select). 컬럼명(시작 전/진행 중/완료)은 값으로만 쓴다.

    def _status_prop(self) -> tuple[str, str]:
        """상태 속성의 (이름, 타입). status 타입 우선, 없으면 select. 둘 다 없으면 에러."""
        props = self._schema().get("properties", {})
        for name, prop in props.items():
            if prop.get("type") == "status":
                return name, "status"
        for name, prop in props.items():
            if prop.get("type") == "select":
                return name, "select"
        raise NotionError("칸반 DB 에 status/select 속성이 없습니다 (상태 컬럼 확인).")

    def status_options(self) -> tuple[str, str, list[str]]:
        """(상태 속성명, 타입, 옵션 이름들). kanban-info 로 시작 전/진행 중/완료 확인용."""
        name, typ = self._status_prop()
        prop = self._schema()["properties"][name]
        opts = prop.get(typ, {}).get("options", [])
        return name, typ, [o["name"] for o in opts]

    def create_card(self, title: str, body_md: str | None = None, status: str | None = None,
                    assignee_ids: list[str] | None = None,
                    basis_url: str | None = None, basis_label: str | None = None) -> tuple[str, str]:
        """칸반 카드(페이지) 1장 생성. (page_id, url) 반환.

        status 주면 상태 속성에 그 값 세팅(옵션에 없으면 에러). body_md 는 카드 본문 블록으로.
        basis_url 있으면 본문 끝에 `근거: <label>` 링크 문단을 단다(회의록 블록 딥링크 등).
        """
        title_prop = self._title_prop()
        props: dict = {title_prop: {"title": [_text(title[:MAX_TEXT])]}}
        if status:
            sname, styp, opts = self.status_options()
            if opts and status not in opts:
                raise NotionError(f"상태 '{status}' 가 칸반 옵션에 없습니다: {opts}")
            props[sname] = {styp: {"name": status}}
        if assignee_ids:
            pprop = self._prop_by_type("people")
            if pprop:
                props[pprop] = {"people": [{"object": "user", "id": i} for i in assignee_ids]}
        children = markdown_to_blocks(body_md) if body_md else []
        if basis_url:
            children.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
                _text("근거: "),
                {"type": "text", "text": {"content": basis_label or basis_url, "link": {"url": basis_url}}},
            ]}})
        page = self._req("POST", "/pages", {
            "parent": self._page_parent(),
            "properties": props,
            "children": children[:MAX_BLOCKS],
        })
        pid = page["id"]
        for i in range(MAX_BLOCKS, len(children), MAX_BLOCKS):
            self._req("PATCH", f"/blocks/{pid}/children", {"children": children[i:i + MAX_BLOCKS]})
        return pid, page.get("url", deeplink(pid, pid))

    def move_card(self, page_id: str, status: str) -> str:
        """카드의 상태를 바꿔 컬럼을 이동한다(시작 전→진행 중→완료 등). url 반환."""
        sname, styp, opts = self.status_options()
        if opts and status not in opts:
            raise NotionError(f"상태 '{status}' 가 칸반 옵션에 없습니다: {opts}")
        page = self._req("PATCH", f"/pages/{page_id}", {"properties": {sname: {styp: {"name": status}}}})
        return page.get("url", deeplink(page_id, page_id))

    def list_cards(self, status: str | None = None) -> list[dict]:
        """칸반 카드 목록 [{id, title, status, url}]. status 주면 그 컬럼만."""
        ds = self._data_source_id()
        path = f"/data_sources/{ds}/query" if ds != self.db else f"/databases/{self.db}/query"
        body: dict = {}
        if status:
            sname, styp, _ = self.status_options()
            body["filter"] = {"property": sname, styp: {"equals": status}}
        sname, styp, _ = self.status_options()
        title_prop = self._title_prop()
        out: list[dict] = []
        cursor = None
        while True:
            if cursor:
                body["start_cursor"] = cursor
            d = self._req("POST", path, body)
            for pg in d.get("results", []):
                pr = pg.get("properties", {})
                title = "".join(x.get("plain_text", "") for x in pr.get(title_prop, {}).get("title", []))
                st = (pr.get(sname, {}).get(styp) or {})
                out.append({"id": pg["id"], "title": title or "(제목 없음)",
                            "status": st.get("name", "") if isinstance(st, dict) else "",
                            "url": pg.get("url", deeplink(pg["id"], pg["id"]))})
            if not d.get("has_more"):
                return out
            cursor = d.get("next_cursor")


def _text(content: str, bold: bool = False) -> dict:
    t = {"type": "text", "text": {"content": content}}
    if bold:
        t["annotations"] = {"bold": True}
    return t


_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")


def _inline_segments(content: str) -> list[tuple[str, bool]]:
    """`**볼드**` 를 (텍스트, 굵게) 조각들로 가른다. 나머지는 평문. 짝 안 맞는 `**` 는 그대로 둔다."""
    segs: list[tuple[str, bool]] = []
    pos = 0
    for m in _BOLD_RE.finditer(content):
        if m.start() > pos:
            segs.append((content[pos:m.start()], False))
        segs.append((m.group(1), True))
        pos = m.end()
    if pos < len(content):
        segs.append((content[pos:], False))
    return segs or [("", False)]


def _rich(content: str) -> list[dict]:
    """`**볼드**` 인라인 서식을 실제 굵게로 반영하고, 2000자 넘으면 조각으로 나눈다(같은 블록 안)."""
    out: list[dict] = []
    for text, bold in _inline_segments(content):
        for i in range(0, len(text), MAX_TEXT):
            out.append(_text(text[i:i + MAX_TEXT], bold))
    return out or [_text("")]


def _block(btype: str, content: str, key: str | None = None) -> dict:
    return {"object": "block", "type": btype, btype: {"rich_text": _rich(content)}}


def _todo_block(content: str, checked: bool = False) -> dict:
    return {"object": "block", "type": "to_do",
            "to_do": {"rich_text": _rich(content), "checked": checked}}


def render_task_groups(groups: list[dict]) -> list[dict]:
    """분리 태스크를 '큰 제목(heading_3) + 메타 + 세부 bullet + 근거' 묶음으로 렌더.

    태스크를 잘게 표로 늘어놓지 않고, 무엇을 하는지 한 줄 제목으로 크게 묶고 세부는 밑에 단다.
    group = {title, owner, track, status, target, details:[...], basis?:{label,kind,idx}}.
    근거 문단은 평문("근거: <label>")으로 두고 link_basis_groups 가 딥링크로 승격한다.
    """
    blocks: list[dict] = []
    for g in groups:
        blocks.append(_block("heading_3", g.get("title", "(제목 없음)")))
        meta = " · ".join(f"{k}: {g[v]}" for k, v in
                          (("담당", "owner"), ("트랙", "track"), ("상태", "status"), ("대상", "target"))
                          if g.get(v))
        if meta:
            blocks.append(_block("paragraph", meta))
        for d in g.get("details", []):
            blocks.append(_block("bulleted_list_item", d))
        label = (g.get("basis") or {}).get("label", "—")
        blocks.append(_block("paragraph", f"근거: {label}"))
    return blocks


def meeting_blocks(summary_md: str, groups: list[dict]) -> list[dict]:
    """회의록 페이지 본문: 요약 블록 + 분리 태스크(묶음) + 검수 체크박스(끈 상태)."""
    return (
        markdown_to_blocks(summary_md)
        + [_block("heading_2", "분리 태스크 (검수용)")]
        + render_task_groups(groups)
        + [_todo_block(REVIEW_TODO, checked=False)]
    )


# ── 근거 딥링크 (블록 단위) ──────────────────────────────────────────────
# 회의록 표의 `근거` 셀을 그 근거가 나온 결정/미결 '블록'으로 점프하는 딥링크로 바꾼다.
# MCP 로는 블록 ID 를 못 얻고 페이지 링크가 멘션으로 자동변환되지만, REST 는
# 블록 ID 를 주고(`GET /blocks/{id}/children`) rich_text.text.link 로 라벨+`#블록ID`
# 앵커를 그대로 저장한다.

def _rest_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Notion-Version": VERSION, "Content-Type": "application/json"}


def _get(token: str, path: str) -> dict:
    r = requests.get(f"{API}{path}", headers=_rest_headers(token), timeout=30)
    if not r.ok:
        raise NotionError(f"GET {path} 실패 {r.status_code}: {r.text[:300]}")
    return r.json()


def _children(token: str, block_id: str) -> list[dict]:
    out: list[dict] = []
    cursor = None
    while True:
        q = "?page_size=100" + (f"&start_cursor={cursor}" if cursor else "")
        d = _get(token, f"/blocks/{block_id}/children{q}")
        out += d.get("results", [])
        if not d.get("has_more"):
            return out
        cursor = d.get("next_cursor")


def deeplink(page_id: str, block_id: str) -> str:
    """UI '블록 링크 복사'와 동형: 페이지 열고 그 블록으로 스크롤."""
    return f"https://www.notion.so/{page_id.replace('-', '')}#{block_id.replace('-', '')}"


def source_blocks(token: str, page_id: str) -> dict[str, list[str]]:
    """번호 매긴 결정사항/미결 항목의 블록 ID(문서 순서). {'결정':[...], '미결':[...]}."""
    out: dict[str, list[str]] = {"결정": [], "미결": []}
    section: str | None = None
    for b in _children(token, page_id):
        t = b["type"]
        if t.startswith("heading"):
            txt = "".join(x.get("plain_text", "") for x in b[t].get("rich_text", []))
            section = "결정" if "결정" in txt else "미결" if "미결" in txt else None
        elif t == "numbered_list_item" and section:
            out[section].append(b["id"])
    return out


def _block_text(b: dict) -> str:
    t = b.get("type", "")
    return "".join(x.get("plain_text", "") for x in b.get(t, {}).get("rich_text", []))


def link_basis_groups(token: str, page_id: str, groups: list[dict]) -> list[str]:
    """분리 태스크 묶음의 `근거: <label>` 문단을 결정/미결 블록 딥링크로 승격.

    문서 순서의 근거 문단 i 를 groups[i].basis({label,kind,idx}) 와 매칭. basis 없으면 평문 유지.
    """
    src = source_blocks(token, page_id)
    paras = [b for b in _children(token, page_id)
             if b["type"] == "paragraph" and _block_text(b).startswith("근거:")]
    done: list[str] = []
    for i, g in enumerate(groups):
        if i >= len(paras):
            break
        basis = g.get("basis")
        if not basis:
            continue
        ids = src.get(basis["kind"], [])
        j = int(basis["idx"]) - 1
        if not (0 <= j < len(ids)):
            raise NotionError(f"{basis['kind']} #{basis['idx']} 블록이 없습니다(문서에 {len(ids)}개).")
        url = deeplink(page_id, ids[j])
        rich = [_text("근거: "), {"type": "text", "text": {"content": basis["label"], "link": {"url": url}}}]
        r = requests.patch(f"{API}/blocks/{paras[i]['id']}", headers=_rest_headers(token),
                           json={"paragraph": {"rich_text": rich}}, timeout=30)
        if not r.ok:
            raise NotionError(f"묶음 {i} 근거 링크 실패 {r.status_code}: {r.text[:300]}")
        done.append(url)
    return done


def _delete_block(token: str, block_id: str) -> None:
    r = requests.delete(f"{API}/blocks/{block_id}", headers=_rest_headers(token), timeout=30)
    if not r.ok:
        raise NotionError(f"블록 삭제 실패 {block_id} {r.status_code}: {r.text[:200]}")


def replace_task_section(token: str, page_id: str, groups: list[dict]) -> None:
    """기존 회의록 페이지의 '분리 태스크' 섹션(제목~끝)만 새 묶음으로 교체(요약 본문은 보존).

    페이지 재생성 없이 in-place. `## 분리 태스크` 헤딩부터 이후 블록을 지우고 새로 붙인 뒤 근거 딥링크.
    """
    children = _children(token, page_id)
    start = next((k for k, b in enumerate(children)
                  if b["type"].startswith("heading") and "분리 태스크" in _block_text(b)), None)
    if start is not None:
        for b in children[start:]:
            _delete_block(token, b["id"])
    new_blocks = ([_block("heading_2", "분리 태스크 (검수용)")]
                  + render_task_groups(groups)
                  + [_todo_block(REVIEW_TODO, checked=False)])
    for i in range(0, len(new_blocks), MAX_BLOCKS):
        r = requests.patch(f"{API}/blocks/{page_id}/children", headers=_rest_headers(token),
                           json={"children": new_blocks[i:i + MAX_BLOCKS]}, timeout=30)
        if not r.ok:
            raise NotionError(f"태스크 섹션 추가 실패 {r.status_code}: {r.text[:300]}")
    link_basis_groups(token, page_id, groups)


def _cmd_replace_tasks(args: list[str]) -> None:
    """python notion.py replace-tasks <page_id> <tasks.json>

    기존 회의록 페이지의 분리 태스크 섹션만 새 묶음(groups)으로 교체. 요약 본문은 그대로.
    tasks.json = {"groups": [{title, owner, track, status, target, details:[...], basis?:{label,kind,idx}}, ...]}.
    """
    if len(args) < 2:
        print("사용법: python notion.py replace-tasks <page_id> <tasks.json>"); sys.exit(2)
    groups = json.loads(Path(args[1]).read_text(encoding="utf-8"))["groups"]
    replace_task_section(_load_token(), args[0], groups)
    print(f"[replace-tasks] {len(groups)}개 태스크 묶음으로 교체 + 근거 딥링크 → {args[0]}")


def archive_page(token: str, page_id: str) -> str:
    """페이지를 Notion 휴지통으로 보낸다(in_trash=true). 완전 삭제 아님 — 복원 가능.
    (API 2025-09-03+ 는 `archived` 대신 `in_trash` 를 받는다.)"""
    r = requests.patch(f"{API}/pages/{page_id}", headers=_rest_headers(token),
                       json={"in_trash": True}, timeout=30)
    if not r.ok:
        raise NotionError(f"archive {page_id} 실패 {r.status_code}: {r.text[:300]}")
    return r.json().get("url", deeplink(page_id, page_id))


def _cmd_archive(args: list[str]) -> None:
    """python notion.py archive <page_id> [<page_id> ...]  — 회의록/테스트 페이지를 휴지통으로."""
    if not args:
        print("사용법: python notion.py archive <page_id> [<page_id> ...]"); sys.exit(2)
    token = _load_token()
    for pid in args:
        url = archive_page(token, pid)
        print(f"[archive] 휴지통으로 → {url}")


def create_meeting(token: str, db_id: str, title: str, blocks: list[dict],
                   date: str | None = None, people_ids: list[str] | None = None) -> tuple[str, str]:
    """블록들로 회의록 페이지 생성. date(YYYY-MM-DD)·people_ids 있으면 날짜/사람 속성도 채운다.
    (page_id, url) 반환."""
    n = Notion(token, db_id)
    title_prop = n._title_prop()
    props = {title_prop: {"title": [_text(title[:MAX_TEXT])]}}
    props.update(n.extra_props(date, people_ids))
    page = n._req("POST", "/pages", {
        "parent": n._page_parent(),
        "properties": props,
        "children": blocks[:MAX_BLOCKS],
    })
    pid = page["id"]
    for i in range(MAX_BLOCKS, len(blocks), MAX_BLOCKS):
        n._req("PATCH", f"/blocks/{pid}/children", {"children": blocks[i:i + MAX_BLOCKS]})
    return pid, page.get("url", deeplink(pid, pid))


def _cmd_create_meeting(args: list[str]) -> None:
    """python notion.py create-meeting <title> <summary.md> <tasks.json> [--dry] [--date YYYY-MM-DD] [--people id1,id2,...]

    tasks.json = {"groups": [{title, owner, track, status, target, details:[...], basis?:{label,kind,idx}}, ...]}
    태스크는 큰 제목 묶음으로 렌더되고, 각 묶음 `근거` 는 생성 후 결정/미결 블록 딥링크로 자동 승격된다.
    --date  = 회의 날짜. '날짜'(date) 속성에 기재.
    --people = 참석자 Notion 유저 ID 콤마열. '사람'(people) 속성에 기재.
    --dry 면 POST 없이 블록 JSON 만 출력(라이브 토큰 없이 구조 검사용).
    태스크 묶음이 없으면 tasks.json 을 `{"groups": []}` 로 두면 요약만 기재된다.
    """
    def _opt(flag: str) -> str | None:
        return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else None

    dry = "--dry" in args
    date = _opt("--date")
    people = [p for p in (_opt("--people") or "").split(",") if p.strip()]
    flags = {"--dry", "--date", "--people"}
    skip = set()
    for f in ("--date", "--people"):
        if f in args:
            skip.add(args.index(f) + 1)
    pos = [a for k, a in enumerate(args) if a not in flags and k not in skip]
    if len(pos) < 3:
        print("사용법: python notion.py create-meeting <title> <summary.md> <tasks.json> [--dry] [--date YYYY-MM-DD] [--people id1,id2,...]"); sys.exit(2)
    title, summary_path, tasks_path = pos[0], pos[1], pos[2]
    summary_md = Path(summary_path).read_text(encoding="utf-8")
    groups = json.loads(Path(tasks_path).read_text(encoding="utf-8"))["groups"]
    blocks = meeting_blocks(summary_md, groups)
    if dry:
        print(json.dumps(blocks, ensure_ascii=False, indent=2))
        print(f"[create-meeting --dry] 최상위 블록 {len(blocks)}개 (POST 안 함)")
        return
    token = _load_token()
    db_id = _env_val("NOTION_DB_ID")
    if not db_id:
        raise NotionError(
            "NOTION_DB_ID 를 .env 에 넣으세요 (회의록 DB).\n"
            "  못 찾으면: python notion.py list-dbs 로 인티그레이션에 공유된 DB id 확인")
    pid, url = create_meeting(token, db_id, title, blocks, date=date, people_ids=people)
    link_basis_groups(token, pid, groups)  # 각 묶음 근거 → 결정/미결 블록 딥링크
    print(f"[create-meeting] 회의록 생성 + 근거 딥링크 → {url}")
    print(f"  page_id={pid}")


def _env_val(key: str) -> str | None:
    """.env 에서 KEY=VALUE 한 줄을 읽는다. 환경변수(os.environ)가 있으면 그걸 우선."""
    import os
    if os.environ.get(key):
        return os.environ[key]
    env = Path(__file__).with_name(".env")
    if env.exists():
        m = re.search(rf"^{re.escape(key)}=(.+)$", env.read_text(encoding="utf-8"), re.M)
        if m:
            return m.group(1).strip()
    return None


def _load_token() -> str:
    tok = _env_val("NOTION_TOKEN")
    if tok:
        return tok
    raise NotionError("NOTION_TOKEN 을 .env 에서 찾지 못했습니다.")


def _extract_id(s: str) -> str | None:
    """URL/문자열에서 Notion 32-hex ID 를 뽑는다(하이픈 무시)."""
    if not s:
        return None
    m = _ID_RE.search(s.replace("-", ""))
    return m.group(0) if m else None


def _kanban_db_id(cli: str | None = None) -> str:
    """칸반 DB ID: CLI 인자(--db/--url) > .env NOTION_KANBAN_DB_ID. 없으면 안내 에러."""
    raw = cli or _env_val("NOTION_KANBAN_DB_ID")
    dbid = _extract_id(raw) if raw else None
    if dbid:
        return dbid
    raise NotionError(
        "칸반 DB ID 를 못 찾았습니다. 보드 URL 로 1회 확인 후 .env 에 넣으세요:\n"
        "  python notion.py kanban-info --url <칸반 보드 URL>\n"
        "  .env → NOTION_KANBAN_DB_ID=<32-hex id>")


def markdown_to_blocks(md: str) -> list[dict]:
    """요약 마크다운을 Notion 블록으로. 지원: #~###, -, 1., 일반 문단, 빈 줄 무시.

    풍부한 렌더링이 목표가 아니라 회의록이 읽히게 하는 정도. 인라인 `**볼드**` 는
    _rich 가 실제 굵게(annotations.bold)로 반영한다 — `**` 리터럴이 노출되지 않는다.
    """
    blocks: list[dict] = []
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("### "):
            blocks.append(_block("heading_3", line[4:]))
        elif line.startswith("## "):
            blocks.append(_block("heading_2", line[3:]))
        elif line.startswith("# "):
            blocks.append(_block("heading_1", line[2:]))
        elif line.lstrip().startswith(("- ", "* ")):
            blocks.append(_block("bulleted_list_item", line.lstrip()[2:]))
        elif (line.lstrip()[:2].rstrip() and line.lstrip()[0].isdigit() and ". " in line[:5]):
            blocks.append(_block("numbered_list_item", line.split(". ", 1)[1]))
        else:
            blocks.append(_block("paragraph", line))
    return blocks or [_block("paragraph", "(내용 없음)")]


# ── 칸반 CLI (new-task / track-task 스킬이 호출) ──────────────────────────

def _getopt(args: list[str], flag: str) -> str | None:
    return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else None


def _kanban(args: list[str]) -> Notion:
    """--db/--url 인자 또는 .env 로 칸반 DB 를 붙인 Notion 인스턴스."""
    return Notion(_load_token(), _kanban_db_id(_getopt(args, "--db") or _getopt(args, "--url")))


def _cmd_kanban_info(args: list[str]) -> None:
    """python notion.py kanban-info [--url <보드 URL> | --db <id>]

    칸반 DB 의 제목 속성·상태 속성(+옵션 이름)·사람 속성을 출력해 시작 전/진행 중/완료 컬럼을
    확인한다. 찾은 32-hex ID 를 .env 의 NOTION_KANBAN_DB_ID 에 넣으면 이후 --url 없이 동작한다.
    """
    n = _kanban(args)
    sname, styp, opts = n.status_options()
    print(f"[kanban-info] db_id={n.db}")
    print(f"  제목 속성 : {n._title_prop()}")
    print(f"  상태 속성 : {sname} ({styp}) → 옵션 {opts}")
    pprop = n._prop_by_type("people")
    print(f"  사람 속성 : {pprop or '(없음)'}")
    for want in (KANBAN_TODO, KANBAN_DOING, KANBAN_DONE):
        mark = "OK" if want in opts else "없음 — 실제 옵션명으로 스킬을 맞추세요"
        print(f"    - '{want}': {mark}")


def _cmd_create_card(args: list[str]) -> None:
    """python notion.py create-card <title> [--body-file <f>] [--status <name>]
        [--assignee <id1,id2>] [--basis-url <u> --basis-label <l>] [--db <id>]

    칸반 카드 1장 생성(기본 상태 = 시작 전). page_id·url 출력.
    """
    pos = [a for a in args if not a.startswith("--")]
    # --flag 다음 값은 위치인자에서 뺀다
    skip = set()
    for f in ("--body-file", "--status", "--assignee", "--basis-url", "--basis-label", "--db", "--url"):
        if f in args and args.index(f) + 1 < len(args):
            skip.add(args[args.index(f) + 1])
    pos = [a for a in pos if a not in skip]
    if not pos:
        print("사용법: python notion.py create-card <title> [--body-file f] [--status name] "
              "[--assignee ids] [--basis-url u --basis-label l] [--db id]"); sys.exit(2)
    title = pos[0]
    body_file = _getopt(args, "--body-file")
    body = Path(body_file).read_text(encoding="utf-8") if body_file else None
    status = _getopt(args, "--status") or KANBAN_TODO
    assignee = [i for i in (_getopt(args, "--assignee") or "").split(",") if i.strip()]
    n = _kanban(args)
    pid, url = n.create_card(title, body_md=body, status=status, assignee_ids=assignee or None,
                             basis_url=_getopt(args, "--basis-url"),
                             basis_label=_getopt(args, "--basis-label"))
    print(f"[create-card] '{title}' ({status}) → {url}")
    print(f"  page_id={pid}")


def _cmd_create_cards(args: list[str]) -> None:
    """python notion.py create-cards <cards.json> [--db <id>]

    cards.json = {"cards": [{title, body?, status?, assignee_ids?, basis_url?, basis_label?}, ...]}.
    new-task 배치·회의요약 승격용. status 기본 = 시작 전. 각 카드 page_id·url 출력.
    """
    pos = [a for a in args if not a.startswith("--")]
    if not pos:
        print("사용법: python notion.py create-cards <cards.json> [--db id]"); sys.exit(2)
    cards = json.loads(Path(pos[0]).read_text(encoding="utf-8"))["cards"]
    n = _kanban(args)
    for c in cards:
        pid, url = n.create_card(
            c["title"], body_md=c.get("body"), status=c.get("status") or KANBAN_TODO,
            assignee_ids=c.get("assignee_ids"), basis_url=c.get("basis_url"),
            basis_label=c.get("basis_label"))
        print(f"[create-cards] '{c['title']}' ({c.get('status') or KANBAN_TODO}) → {url}  page_id={pid}")


def _cmd_move_card(args: list[str]) -> None:
    """python notion.py move-card <page_id> <status> [--db <id>]  — 카드 상태(컬럼) 이동."""
    pos = [a for a in args if not a.startswith("--")]
    if len(pos) < 2:
        print("사용법: python notion.py move-card <page_id> <status>  (예: ... 완료)"); sys.exit(2)
    url = _kanban(args).move_card(pos[0], pos[1])
    print(f"[move-card] → '{pos[1]}' : {url}")


def _cmd_list_cards(args: list[str]) -> None:
    """python notion.py list-cards [--status <name>] [--db <id>]  — 카드 목록(제목·상태·url)."""
    cards = _kanban(args).list_cards(status=_getopt(args, "--status"))
    for c in cards:
        print(f"  [{c['status']}] {c['title']}\n      {c['url']}  page_id={c['id']}")
    print(f"[list-cards] {len(cards)}건")


def _cmd_list_dbs(args: list[str]) -> None:
    """python notion.py list-dbs [<검색어>]

    인티그레이션이 접근 가능한 DB/데이터소스를 제목+id 로 나열한다(POST /v1/search, 읽기).
    회의록 DB 와 칸반(작업 현황) DB 의 진짜 id 를 구분해 찾을 때 쓴다.
    """
    token = _load_token()
    query = args[0] if args and not args[0].startswith("--") else None
    cursor = None
    seen = 0
    while True:
        body: dict = {"page_size": 100}
        if query:
            body["query"] = query
        if cursor:
            body["start_cursor"] = cursor
        r = requests.post(f"{API}/search", headers=_rest_headers(token), json=body, timeout=30)
        if not r.ok:
            raise NotionError(f"search 실패 {r.status_code}: {r.text[:300]}")
        d = r.json()
        for res in d.get("results", []):
            obj = res.get("object", "")
            if obj not in ("database", "data_source"):
                continue
            title_src = res.get("title") or res.get("name") or []
            if isinstance(title_src, str):
                title = title_src
            else:
                title = "".join(t.get("plain_text", "") for t in title_src)
            print(f"  [{obj}] {title or '(제목 없음)'}\n      id={res.get('id')}  url={res.get('url', '')}")
            seen += 1
        if not d.get("has_more"):
            break
        cursor = d.get("next_cursor")
    print(f"[list-dbs] {seen}개 (인티그레이션에 공유된 DB/데이터소스)")


if __name__ == "__main__":
    # 출력에 한글·화살표(→)·em-dash 가 섞이므로 콘솔 코드페이지(cp949 등)와 무관하게 UTF-8 로 찍는다.
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    rest = sys.argv[2:]
    if cmd == "replace-tasks":
        _cmd_replace_tasks(rest)
    elif cmd == "archive":
        _cmd_archive(rest)
    elif cmd == "create-meeting":
        _cmd_create_meeting(rest)
    elif cmd == "kanban-info":
        _cmd_kanban_info(rest)
    elif cmd == "create-card":
        _cmd_create_card(rest)
    elif cmd == "create-cards":
        _cmd_create_cards(rest)
    elif cmd == "move-card":
        _cmd_move_card(rest)
    elif cmd == "list-cards":
        _cmd_list_cards(rest)
    elif cmd == "list-dbs":
        _cmd_list_dbs(rest)
    else:
        print(__doc__); sys.exit(2)
