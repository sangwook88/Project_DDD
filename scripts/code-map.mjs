#!/usr/bin/env node
// code-map — 도메인 코드 디렉토리에서 "시그니처 골격"을 뽑는다 (Tier B).
//
// 위키는 계약에서 멈추고, 그 아래 코드 구조는 여기서 *파생*한다(md에 안 적음).
// 본문은 ⋮…로 접고 정의(class/function/method)의 시그니처 + import/참조만 남긴다.
// 의도는 위키 계약이 담당하므로 docstring은 안 긁는다(stale 회피). 시그니처가 진실.
//
// "다양한 코드 환경"을 위해 백엔드 2단 — ctags 있으면 정밀, 없으면 정규식 폴백:
//   ① universal-ctags (--output-format=json)  — 50+ 언어, 언어별 쿼리 유지 불필요
//   ② 내장 정규식 폴백                          — 의존성 0, brace/keyword 휴리스틱
//
// 사용: node code-map.mjs --dir <code dir> [--rel <표시 기준 경로>]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++)
    if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1], i++;
  return a;
}

// 골격 추출 대상 소스 확장자 (광범위 — 언어 불문)
const SRC = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".cs", ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".php",
  ".swift", ".scala", ".dart", ".ex", ".exs", ".lua",
]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".ddd-cache", "__pycache__", "target", "bin", "obj"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SRC.has(path.extname(name))) out.push(p);
  }
  return out;
}

// ── 백엔드 ① ctags ────────────────────────────────────────────────
function hasCtags() {
  const r = spawnSync("ctags", ["--version"], { encoding: "utf8" });
  return r.status === 0 && /universal ctags/i.test(r.stdout || "");
}

// 정의로 칠 kind (참조·변수 등은 골격에서 제외)
const DEF_KINDS = new Set([
  "class", "interface", "struct", "enum", "trait", "impl", "module", "namespace",
  "function", "method", "member", "constructor", "func", "def",
]);

function viaCtags(dir, rel) {
  const r = spawnSync("ctags",
    ["-R", "--output-format=json", "--fields=+nksSK", "-f", "-", dir],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const byFile = new Map();
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let t; try { t = JSON.parse(line); } catch { continue; }
    if (t._type !== "tag" || !DEF_KINDS.has(t.kind)) continue;
    const f = path.relative(rel, t.path).replace(/\\/g, "/");
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(t);
  }
  const blocks = [];
  for (const [f, tags] of [...byFile.entries()].sort()) {
    tags.sort((a, b) => (a.line || 0) - (b.line || 0));
    const lines = tags.map((t) => {
      const scope = t.scope ? `${t.scope}.` : "";
      const sig = t.signature || "";
      return `  ${t.kind} ${scope}${t.name}${sig}`;
    });
    blocks.push(`// ${f}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

// ── 백엔드 ② 정규식 폴백 ──────────────────────────────────────────
// ctags 없을 때의 degraded 경로. brace 언어(TS/JS/Java/C#/C++/Go/Rust…)에 맞춰
// 얕은 깊이의 정의/시그니처만 남기고 본문은 ⋮…로 접는다. 들여쓰기 언어(Python 등)는
// 컨테이너 중첩을 못 세므로 평평하게 나열 — 정밀 추출은 ctags 권장(§백엔드 ①).
const IMPORT_RE = /^\s*(import\s|from\s|require\(|#include|use\s|using\s)/;
const CTRL = /^(if|for|while|switch|return|else|elif|catch|do|case|with|when|throw|await|yield)\b/;
// 선언 키워드로 시작(접근지정자·async 등 수식어 허용)
const LEAD_DEF = /^((export|public|private|protected|internal|static|async|final|abstract|override|virtual|pub|open)\s+)*(class|interface|struct|enum|trait|impl|module|namespace|object|record|def|func|function|fn|sub|proc|type)\b/;
const CONTAINER = /\b(class|interface|struct|enum|trait|impl|module|namespace|object|record)\b/;

function viaFallback(files, rel) {
  const blocks = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const f = path.relative(rel, file).replace(/\\/g, "/");
    const out = [];
    let depth = 0;
    for (const ln of src) {
      const t = ln.trim();
      if (!t) continue;
      const opens = (ln.match(/\{/g) || []).length;
      const closes = (ln.match(/\}/g) || []).length;
      if (IMPORT_RE.test(ln)) { out.push(t); depth += opens - closes; continue; }

      const keywordLed = LEAD_DEF.test(t) && !CTRL.test(t);
      const beforeParen = t.split("(")[0];
      // 본문 여는 { 로 끝 + (파라미터 목록) 존재 + ( 앞에 대입(=) 없음 + 제어문 아님.
      // 좁은 정규식 대신 구조로 판정 — 반환 타입에 인라인 {}(Promise<{…}>)가 있어도 잡힌다.
      const sigLike = t.endsWith("{") && /\([^)]*\)/.test(t) && !/=/.test(beforeParen) && !CTRL.test(t);

      if (depth <= 1 && (keywordLed || sigLike) && t.endsWith("{")) {
        out.push("  ".repeat(depth) + t.replace(/\s*\{$/, ""));
        if (CONTAINER.test(t)) out.push("  ".repeat(depth) + "{");
        else out.push("  ".repeat(depth + 1) + "⋮…");
      } else if (keywordLed && /:\s*$/.test(t)) {     // Python 등 brace 없는 def/class
        out.push(t);
        if (!CONTAINER.test(t)) out.push("  ⋮…");
      } else if (t.startsWith("}") && depth >= 1) {
        out.push("  ".repeat(depth - 1) + "}");
      }
      depth += opens - closes;
    }
    if (out.length) blocks.push(`// ${f}\n${out.join("\n")}`);
  }
  return blocks.join("\n\n");
}

// ── main ──────────────────────────────────────────────────────────
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.dir) { console.error("usage: node code-map.mjs --dir <code dir> [--rel <base>]"); process.exit(2); }
  if (!fs.existsSync(a.dir)) { console.error(`코드 디렉토리 없음: ${a.dir}`); process.exit(1); }
  const rel = a.rel || a.dir;

  let body, backend;
  if (hasCtags()) { body = viaCtags(a.dir, rel); backend = "ctags"; }
  if (body == null) { body = viaFallback(walk(a.dir), rel); backend = "regex-fallback"; }

  console.log(`## 코드 골격 (${path.relative(rel, a.dir).replace(/\\/g, "/") || a.dir} — 파생, ${backend})`);
  console.log(body || "- (정의 없음)");
}

main();
