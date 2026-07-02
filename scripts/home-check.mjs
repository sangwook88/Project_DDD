#!/usr/bin/env node
// home-check — HOME.md 참조 그래프가 현실(도메인 폴더)과 일치하는지 검증한다.
//
// context-pack은 HOME ## 참조 그래프를 *진실*로 신뢰한다. HOME이 폴더와 어긋나면
// 팩이 거짓말을 한다(규약 §인터페이스(계약면) — 안전장치). 이 스크립트가 그 어긋남을 잡는다.
//
// ground-truth 두 소스(규약 §분할 축):
//   ① README frontmatter `depends:`  — FE→BE, BE→BE 선언
//   ② 요소/*.md `## 호출하는 기능` 링크 — FE→BE 호출
// 이 둘에서 역산한 엣지 ↔ HOME ## 참조 그래프 엣지를 대조한다.
//
// 사용: node home-check.mjs --root <docs> [--code-root <repo>] [--fix]
// exit 0 = 일치, 1 = 불일치(게이트·CI에서 막을 수 있게).
// --fix: 엣지 드리프트(HOME↔선언)를 자동 재조정(빠진 엣지 추가·stale 제거, [event]·주석 보존).
//        폴더/코드/순환 문제는 자동으로 못 고치므로 남으면 여전히 exit 1.
import fs from "node:fs";
import path from "node:path";

const root = (() => {
  const i = process.argv.indexOf("--root");
  if (i < 0) { console.error("usage: node home-check.mjs --root <docs> [--code-root <repo>] [--fix]"); process.exit(2); }
  return process.argv[i + 1];
})();
const doFix = process.argv.includes("--fix");

// 코드는 docs 바깥(src/)에 산다. 기본 코드 루트 = docs 루트의 상위(레포 루트).
const codeRoot = (() => {
  const i = process.argv.indexOf("--code-root");
  return i >= 0 ? process.argv[i + 1] : path.dirname(path.resolve(root));
})();

const SLUG = /\b((?:fe|be)\/[A-Za-z0-9_-]+)/g;
const key = (e) => `${e.from} → ${e.to}`;

// ── HOME ──
function parseHome() {
  const md = fs.readFileSync(path.join(root, "HOME.md"), "utf8");
  const tableSlugs = new Set(), edges = new Set();
  let section = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) { section = line.slice(3).trim(); continue; }
    if (line.startsWith("|") && /도메인/.test(section || "")) {
      const c = line.split("|").map((x) => x.trim());
      const slug = c[1];
      if (/^(fe|be)\//.test(slug)) tableSlugs.add(slug);
    }
    if (section === "참조 그래프" && line.startsWith("-")) {
      const m = line.replace(/^-\s*/, "").split("#")[0].split(/→|->/).map((s) => s.trim());
      // [event]/[sync] 연동방식 태그는 슬러그가 아니라 메타데이터 — 떼어내고 비교(규약 §연동 방식)
      const to = (m[1] || "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
      if (m.length === 2 && m[0] && to) edges.add(key({ from: m[0], to }));
    }
  }
  return { tableSlugs, edges };
}

// ── 폴더에서 역산 ──
function frontmatterDepends(file) {
  if (!fs.existsSync(file)) return [];
  const md = fs.readFileSync(file, "utf8");
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const dl = fm[1].match(/depends:\s*(\[[^\]]*\])?([\s\S]*?)(?=\n\w|$)/);
  if (!dl) return [];
  const inline = dl[1] ? [...dl[1].matchAll(SLUG)].map((m) => m[1]) : [];
  const multi = [...(dl[2] || "").matchAll(SLUG)].map((m) => m[1]);
  return [...new Set([...inline, ...multi])];
}

function elementCalls(feDir) {
  const elDir = path.join(feDir, "요소");
  const targets = new Set();
  if (!fs.existsSync(elDir)) return targets;
  for (const f of fs.readdirSync(elDir)) {
    if (!f.endsWith(".md")) continue;
    const md = fs.readFileSync(path.join(elDir, f), "utf8");
    const sec = md.split(/^##\s+/m).find((s) => s.startsWith("호출하는 기능"));
    if (sec) for (const m of sec.matchAll(SLUG)) if (m[1].startsWith("be/")) targets.add(m[1]);
  }
  return targets;
}

function deriveEdges() {
  const edges = new Set(), folderSlugs = new Set();
  for (const track of ["fe", "be"]) {
    const tdir = path.join(root, track);
    if (!fs.existsSync(tdir)) continue;
    for (const name of fs.readdirSync(tdir)) {
      const dir = path.join(tdir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const slug = `${track}/${name}`;
      folderSlugs.add(slug);
      for (const dep of frontmatterDepends(path.join(dir, "README.md")))
        if (dep !== slug) edges.add(key({ from: slug, to: dep }));
      if (track === "fe")
        for (const t of elementCalls(dir)) edges.add(key({ from: slug, to: t }));
    }
  }
  return { edges, folderSlugs };
}

// ── 코드 위치 검증 (Tier B 고리: slug → 코드 폴더) ──
// frontmatter 단순 필드 읽기(주석 `# code:` 줄은 키가 `#`로 시작해 무시됨)
function frontmatter(file) {
  if (!fs.existsSync(file)) return {};
  const fm = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return {};
  const obj = {};
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

// status≠not-started 인 도메인의 코드 폴더(기본 src/<slug>, override=code:)가 존재·비어있지 않은지.
// not-started 는 코드 전 단계라 검사 제외.
function checkCode() {
  const missing = [];
  for (const track of ["fe", "be"]) {
    const tdir = path.join(root, track);
    if (!fs.existsSync(tdir)) continue;
    for (const name of fs.readdirSync(tdir)) {
      const dir = path.join(tdir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const slug = `${track}/${name}`;
      const fm = frontmatter(path.join(dir, "README.md"));
      if ((fm.status || "not-started") === "not-started") continue;
      const rel = fm.code || `src/${slug}`;
      const codeDir = path.join(codeRoot, rel);
      const ok = fs.existsSync(codeDir) && fs.statSync(codeDir).isDirectory()
        && fs.readdirSync(codeDir).length > 0;
      if (!ok) missing.push(`${slug} → ${rel}`);
    }
  }
  return missing;
}

// ── 순환 탐지 (규약: 단방향·비순환) ──
function findCycle(edgeKeys) {
  const adj = new Map();
  for (const k of edgeKeys) {
    const [from, to] = k.split(" → ");
    (adj.get(from) || adj.set(from, []).get(from)).push(to);
  }
  const seen = new Set(), stack = new Set();
  let cyc = null;
  const dfs = (n, p) => {
    seen.add(n); stack.add(n);
    for (const m of adj.get(n) || []) {
      if (stack.has(m)) cyc = [...p, n, m];
      else if (!seen.has(m)) dfs(m, [...p, n]);
    }
    stack.delete(n);
  };
  for (const n of adj.keys()) if (!seen.has(n) && !cyc) dfs(n, []);
  return cyc;
}

// ── 재조정 (--fix): 선언에서 유도한 엣지에 HOME을 병합 ──
// 빠진 엣지 추가 + stale 제거. 살아남는 엣지의 [event]·주석은 그대로 보존(재생성 아님).
function edgeKeyOf(line) {
  const m = line.replace(/^-\s*/, "").split("#")[0].split(/→|->/).map((s) => s.trim());
  const to = (m[1] || "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  return (m.length === 2 && m[0] && to) ? key({ from: m[0], to }) : null;
}
function fixHome(homeOnly, realOnly) {
  const file = path.join(root, "HOME.md");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const stale = new Set(homeOnly);
  const missing = realOnly.map((e) => {
    const [f, to] = e.split(" → ");
    return `- ${f} → ${to}  # 자동 추가 — 연동방식(sync/event) 확인`;
  });
  const out = [];
  let inGraph = false, added = 0, removed = 0;
  const flushMissing = () => { for (const l of missing) { out.push(l); added++; } };
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("## ")) {
      if (inGraph) flushMissing();               // 그래프 섹션 끝 — 빠진 엣지 append
      inGraph = t.slice(3).trim() === "참조 그래프";
      out.push(raw); continue;
    }
    if (inGraph && t.startsWith("-") && stale.has(edgeKeyOf(t))) { removed++; continue; }
    out.push(raw);
  }
  if (inGraph) flushMissing();                    // 그래프가 마지막 섹션이면 EOF에 append
  fs.writeFileSync(file, out.join("\n"));
  return { added, removed };
}

// ── 대조 ──
const home = parseHome();
const real = deriveEdges();
const diff = (a, b) => [...a].filter((x) => !b.has(x));

const homeOnly = diff(home.edges, real.edges);      // HOME엔 있는데 근거 없음
const realOnly = diff(real.edges, home.edges);      // 현실엔 있는데 HOME 누락
const noFolder = [...home.tableSlugs].filter((s) => !real.folderSlugs.has(s));
const noTable = [...real.folderSlugs].filter((s) => !home.tableSlugs.has(s));
const codeMissing = checkCode();                    // 코드 폴더 없음/빔(status≠not-started)
const cycle = findCycle([...home.edges, ...real.edges]);

const ok = !homeOnly.length && !realOnly.length && !noFolder.length && !noTable.length && !codeMissing.length && !cycle;

console.log(`# HOME 정합성 — ${ok ? "✓ 일치" : "✗ 불일치"}  (root: ${root})`);
const report = (title, items, hint) => {
  if (!items.length) return;
  console.log(`\n## ${title}`);
  for (const it of items) console.log(`- ${it}`);
  if (hint) console.log(`  → ${hint}`);
};
report("HOME에만 있는 엣지 (현실 근거 없음)", homeOnly, "요소 링크·depends가 사라졌다면 HOME에서 제거");
report("현실에만 있는 엣지 (HOME 누락)", realOnly, "HOME ## 참조 그래프에 추가");
report("HOME 표에 있으나 폴더 없음", noFolder, "오타이거나 미생성 도메인");
report("폴더 있으나 HOME 표에 없음", noTable, "decompose로 HOME 표에 등재");
report("코드 위치 없음/빔 (status≠not-started)", codeMissing, "src/<slug> 에 코드를 두거나 README code: 로 위치 명시");
if (cycle) console.log(`\n## ✗ 순환 의존\n- ${cycle.join(" → ")}\n  → 단방향·비순환 규약 위반 — 경계 재검토`);
if (doFix && (homeOnly.length || realOnly.length)) {
  const { added, removed } = fixHome(homeOnly, realOnly);
  console.log(`\n🔧 --fix: HOME ## 참조 그래프 재조정 — 추가 ${added}, 제거 ${removed}. 새 엣지 연동방식(sync/event) 확인 후 커밋하세요.`);
}
// 엣지 드리프트(homeOnly/realOnly)는 --fix로 해소. 폴더/표/코드/순환은 자동으로 못 고침 → 남으면 불일치.
const okAfterFix = !noFolder.length && !noTable.length && !codeMissing.length && !cycle;
if (ok) console.log("\n선언 그래프와 폴더 현실이 일치합니다. 팩을 신뢰할 수 있습니다.");
else if (doFix && okAfterFix) console.log("\n엣지 드리프트를 재조정했습니다 — 나머지 문제 없음. 재검증 권장.");

process.exit((doFix ? okAfterFix : ok) ? 0 : 1);
