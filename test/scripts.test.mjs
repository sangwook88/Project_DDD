// 세 스크립트(home-check / context-pack / code-map)의 회귀 테스트.
// node 내장 node:test 만 사용(외부 의존성 없음). 픽스처 = examples/wiki-demo.
//
// 임시 변형이 필요한 테스트는 os.tmpdir() 에 예제를 복사한 뒤 변형하고 정리한다
// (원본 examples/wiki-demo 는 절대 더럽히지 않는다). 단언은 정확한 토큰 수 같은
// 취약한 값이 아니라 구조적 마커(섹션 제목·exit code·키워드 포함)로 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SCRIPTS = path.join(REPO, "scripts");
const DEMO = path.join(REPO, "examples", "wiki-demo");
const DEMO_DOCS = path.join(DEMO, "docs");

// 스크립트를 spawn 해 { code, out } 반환 (stdout+stderr 합쳐 검색 편의).
function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// 예제를 임시 디렉토리로 복사하고, 끝나면 정리하는 콜백을 받는 헬퍼.
function withCopy(t, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-demo-"));
  const root = path.join(dir, "wiki-demo");
  fs.cpSync(DEMO, root, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fn(root, path.join(root, "docs"));
}

// ── 1. home-check 정상 ────────────────────────────────────────────
test("home-check: 예제는 정합성 일치(exit 0)", () => {
  const { code, out } = run("home-check.mjs", ["--root", DEMO_DOCS]);
  assert.equal(code, 0, out);
  assert.match(out, /✓ 일치/);
});

// ── 2. home-check 엣지 불일치 ─────────────────────────────────────
test("home-check: HOME에서 엣지 제거 → 현실에만 있는 엣지로 exit 1", (t) => {
  withCopy(t, (_root, docs) => {
    const home = path.join(docs, "HOME.md");
    const md = fs
      .readFileSync(home, "utf8")
      .split(/\r?\n/)
      .filter((ln) => !/be\/order → be\/payment/.test(ln))
      .join("\n");
    fs.writeFileSync(home, md);

    const { code, out } = run("home-check.mjs", ["--root", docs]);
    assert.equal(code, 1, out);
    assert.match(out, /현실에만 있는 엣지/);
    assert.match(out, /be\/order → be\/payment/);
  });
});

// ── 3. home-check 코드 누락 ───────────────────────────────────────
test("home-check: in-progress 도메인의 코드 폴더 삭제 → 코드 위치 없음으로 exit 1", (t) => {
  withCopy(t, (root, docs) => {
    fs.rmSync(path.join(root, "src", "be", "grade"), {
      recursive: true,
      force: true,
    });

    const { code, out } = run("home-check.mjs", ["--root", docs]);
    assert.equal(code, 1, out);
    assert.match(out, /코드 위치 없음\/빔/);
    assert.match(out, /be\/grade/);
  });
});

// ── 4. context-pack 티어 슬라이싱 ─────────────────────────────────
test("context-pack: 타깃 T0 전문 + 이웃 T1 계약면(처리 본문 절단)", () => {
  const { code, out } = run("context-pack.mjs", [
    "--root",
    DEMO_DOCS,
    "--target",
    "be/payment",
    "--direction",
    "down",
  ]);
  assert.equal(code, 0, out);
  // 타깃은 전문(T0): 입력 + 처리 본문 모두 존재
  assert.match(out, /전문\(T0\)/);
  assert.match(out, /## 입력/);
  assert.match(out, /PG 게이트웨이로 승인 요청/); // payment 처리 본문(T0)
  // 이웃 be/grade 는 인터페이스(T1)
  assert.match(out, /be\/grade/);
  assert.match(out, /인터페이스\(T1\)/);
  // grade 의 ## 처리 본문은 T1 에서 잘려야 한다
  assert.doesNotMatch(out, /구간 임계값으로 등급을 매핑/);
});

// ── 5. context-pack --with-code ───────────────────────────────────
test("context-pack --with-code: 타깃 T0 에 코드 골격 append", () => {
  const { code, out } = run("context-pack.mjs", [
    "--root",
    DEMO_DOCS,
    "--target",
    "be/payment",
    "--with-code",
  ]);
  assert.equal(code, 0, out);
  assert.match(out, /## 코드 골격/);
  assert.match(out, /class PaymentApprover/); // 클래스 시그니처
  assert.match(out, /⋮…/); // 본문 접힘 마커
});

// ── 6. code-map ───────────────────────────────────────────────────
test("code-map: payment 디렉토리에서 시그니처 골격 추출", () => {
  const { code, out } = run("code-map.mjs", [
    "--dir",
    path.join(DEMO, "src", "be", "payment"),
  ]);
  assert.equal(code, 0, out);
  assert.match(out, /## 코드 골격/);
  assert.match(out, /class PaymentApprover/);
  assert.match(out, /⋮…/);
});
