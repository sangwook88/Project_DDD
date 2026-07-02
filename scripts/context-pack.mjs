#!/usr/bin/env node
// context-pack — DDD LLM-wiki를 repomap식 "컨텍스트 팩"으로 압축해 출력한다.
//
// Aider repomap이 코드에서 골조를 *생성*하는 단계를, 우리는 건너뛴다:
// HOME.md ## 참조 그래프(선언된 의존 DAG) + 도메인 폴더(저작된 골조)를 그대로
// 그래프 거리별 티어로 압축해 주입한다. tree-sitter·임베딩 없음.
//
// 티어(규약 §인터페이스(계약면)):
//   T0 타깃        = 폴더 전문 (일지.md 제외)
//   T1 1홉 의존    = 계약면 섹션만 (인터페이스 스켈레톤)
//   T2+ 전이 의존  = HOME 표의 한 줄 역할만
//
// 사용:
//   node context-pack.mjs --root <docs> --target be/payment [opts]
//   opts: --depth 2  --direction down|up|both  --budget 6000  --mode pack|map
//
// direction: down=타깃이 부르는 것(구현 계약) · up=타깃을 부르는 것(영향범위) · both
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ── args ───────────────────────────────────────────────────────────
const BOOL = new Set(["with-code"]);              // 값 없는 플래그
function parseArgs(argv) {
  const a = { depth: 2, direction: "down", budget: 6000, mode: "pack" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    if (BOOL.has(key)) a[key] = true;
    else { a[key] = argv[i + 1]; i++; }
  }
  a.depth = Number(a.depth);
  a.budget = Number(a.budget);
  return a;
}

// ── Tier B 코드 골격: 타깃 도메인 코드 디렉토리를 code-map.mjs로 추출 ──
const SELF_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
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
function extractCode(slug, root, codeRoot) {
  const rel = frontmatter(path.join(root, slug, "README.md")).code || `src/${slug}`;
  const dir = path.join(codeRoot, rel);
  if (!fs.existsSync(dir)) return "";          // greenfield — 골격 없음
  const r = spawnSync(process.execPath,
    [path.join(SELF_DIR, "code-map.mjs"), "--dir", dir, "--rel", codeRoot],
    { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

const estTok = (s) => Math.ceil([...s].length / 3.2); // 한국어 섞인 거친 추정

// ── HOME 파싱 ──────────────────────────────────────────────────────
function parseHome(root) {
  const home = fs.readFileSync(path.join(root, "HOME.md"), "utf8");
  const roles = {}; // slug -> 역할 한 줄
  const edges = []; // { from, to }
  let section = null;
  for (const raw of home.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) { section = line.slice(3).trim(); continue; }
    // 도메인 표 행: | slug | 역할 | 상태 |
    if (line.startsWith("|") && /도메인/.test(section || "")) {
      const cols = line.split("|").map((c) => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
      const slug = cols[0];
      if (!slug || slug === "slug" || /^-+$/.test(slug)) continue;
      if (/^(fe|be)\//.test(slug)) roles[slug] = cols[1] || "";
      continue;
    }
    // 참조 그래프 행: - fe/a → be/b  [event]   # 주석
    if (section === "참조 그래프" && line.startsWith("-")) {
      const body = line.replace(/^-\s*/, "").split("#")[0];
      const m = body.split(/→|->/).map((s) => s.trim());
      if (m.length === 2 && m[0] && m[1]) {
        const style = /\[\s*event\s*\]/i.test(m[1]) ? "event" : "sync";   // 연동방식(규약 §연동 방식)
        const to = m[1].replace(/\s*\[[^\]]*\]\s*$/, "").trim();
        if (to) edges.push({ from: m[0], to, style });
      }
    }
  }
  return { roles, edges };
}

// 방향별 인접: down=내가 부르는 곳, up=나를 부르는 곳
function neighbors(edges, node, dir) {
  const out = [];
  for (const e of edges) {
    if ((dir === "down" || dir === "both") && e.from === node) out.push(e.to);
    if ((dir === "up" || dir === "both") && e.to === node) out.push(e.from);
  }
  return out;
}

// BFS로 홉 거리(=티어) 부여
function walk(edges, target, depth, dir) {
  const tier = new Map([[target, 0]]);
  let frontier = [target];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const n of frontier)
      for (const nb of neighbors(edges, n, dir))
        if (!tier.has(nb)) tier.set(nb, d + 1), next.push(nb);
    frontier = next;
  }
  return tier; // slug -> hop
}

// ── 마크다운 섹션 분해 ─────────────────────────────────────────────
function parseSections(md) {
  const lines = md.split(/\r?\n/);
  let preamble = [], sections = [], cur = null;
  for (const ln of lines) {
    const m = ln.match(/^##\s+(.*)$/);
    if (m) { if (cur) sections.push(cur); cur = { title: m[1].trim(), body: [] }; }
    else if (cur) cur.body.push(ln);
    else preamble.push(ln);
  }
  if (cur) sections.push(cur);
  return { preamble: preamble.join("\n").trim(), sections };
}

const pick = (secs, titles) => secs.filter((s) => titles.includes(s.title));
const render = (pre, secs) =>
  [pre, ...secs.map((s) => `## ${s.title}\n${s.body.join("\n").trim()}`)].filter(Boolean).join("\n\n");

// 데이터.md 표를 앞 2칸(필드·타입)으로 축소 + enum은 값 이름만
function sliceData(md) {
  const { preamble, sections } = parseSections(md);
  const out = sections.map((s) => {
    if (s.title === "enum") {
      const names = [...s.body.join("\n").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      return { title: s.title, body: [names.length ? names.map((n) => `\`${n}\``).join(", ") : ""] };
    }
    const body = s.body.map((ln) => {
      if (!ln.trim().startsWith("|")) return ln;
      const cols = ln.split("|");
      return [cols[0], cols[1], cols[2], ""].join("|"); // 앞 2칸만
    });
    return { title: s.title, body };
  });
  return render(preamble, out);
}

// 파일 1개를 티어에 맞춰 슬라이스
function sliceFile(file, name, tier) {
  const md = fs.readFileSync(file, "utf8");
  if (tier === 0) return md.trim(); // 전문
  // T1 계약면
  if (name === "README.md") return md.trim();
  if (name === "데이터.md") return sliceData(md);
  const { preamble, sections } = parseSections(md);
  if (name.startsWith("기능_")) return render(preamble, pick(sections, ["입력", "출력·변경"]));
  if (name === "플로우.md") return render(preamble, pick(sections, ["FE 전체 값"]));
  // 요소/*.md
  return render(preamble, pick(sections, ["호출하는 기능", "내보내는 값 (출력)"]));
}

// 도메인 폴더의 파일을 읽을 순서로 나열 (일지 제외)
function domainFiles(dir) {
  const files = [];
  const readme = path.join(dir, "README.md");
  if (fs.existsSync(readme)) files.push(["README.md", readme]);
  for (const f of fs.readdirSync(dir).sort()) {
    if (f === "README.md" || f === "일지.md") continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      for (const sub of fs.readdirSync(p).sort()) files.push([`${f}/${sub}`, path.join(p, sub)]);
    } else if (f.endsWith(".md")) files.push([f, p]);
  }
  return files;
}

// ── 렌더 ───────────────────────────────────────────────────────────
function buildBlock(root, slug, hop, roles) {
  const dir = path.join(root, slug);
  const role = roles[slug] || "";
  if (hop >= 2 || !fs.existsSync(dir))
    return { slug, hop, label: "요약(T2)", text: `- ${role}  \`[펼치려면: ${slug}]\`` };
  const tierName = hop === 0 ? "전문(T0)" : "인터페이스(T1)";
  const parts = [];
  for (const [name, file] of domainFiles(dir)) {
    const sliced = sliceFile(file, name, hop);
    if (sliced.trim()) parts.push(`<!-- ${slug}/${name} -->\n${sliced}`);
  }
  let text = parts.join("\n\n");
  if (hop === 1) text += `\n\n\`[펼치려면: ${slug} 전문]\``;
  return { slug, hop, label: tierName, text };
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.root || !a.target) {
    console.error("usage: node context-pack.mjs --root <docs> --target <slug> [--depth 2 --direction down|up|both --budget 6000 --mode pack|map --with-code [--code-root <repo>]]");
    process.exit(2);
  }
  const codeRoot = a["code-root"] || path.dirname(path.resolve(a.root));
  const { roles, edges } = parseHome(a.root);
  const tier = walk(edges, a.target, a.depth, a.direction);

  // 지도: 포함된 도메인을 건드리는 엣지만
  const inc = new Set(tier.keys());
  const mapLines = edges
    .filter((e) => inc.has(e.from) && inc.has(e.to))
    .map((e) => `- ${e.from} → ${e.to}`);

  // 우선순위: 홉 오름차순
  const ordered = [...tier.entries()].sort((x, y) => x[1] - y[1]);
  let blocks = ordered.map(([slug, hop]) => buildBlock(a.root, slug, hop, roles));

  // Tier B: 타깃(hop 0)에만 코드 골격 append (거리로 안 자름 — 도메인 하나 통째)
  if (a["with-code"] && a.mode !== "map")
    for (const b of blocks)
      if (b.hop === 0) {
        const code = extractCode(b.slug, a.root, codeRoot);
        if (code) b.text += `\n\n${code}`;
      }

  const header = `# 컨텍스트 팩 — 타깃 \`${a.target}\`  (방향 ${a.direction} · 깊이 ${a.depth} · 모드 ${a.mode})`;
  const mapBlock = `## 지도 (참조 그래프 — 항상 통째)\n${mapLines.join("\n") || "- (엣지 없음)"}`;

  if (a.mode === "map") {
    // 점진 공개용 매니페스트: 주소 + 역할 + 토큰비용 + 펼침
    const lines = blocks.map((b) => `- \`${b.slug}\` — ${b.label}, ~${estTok(b.text)} tok · ${roles[b.slug] || ""}  \`[펼치려면: ${b.slug}]\``);
    console.log([header, mapBlock, "## 도메인 (펼침 가능)", lines.join("\n")].join("\n\n"));
    return;
  }

  // pack 모드: 예산 맞춤 — 초과 시 T1을 README-only로 강등
  let est = () => estTok(blocks.map((b) => b.text).join("\n"));
  let note = "";
  if (est() > a.budget) {
    blocks = blocks.map((b) => {
      if (b.hop !== 1) return b;
      const readme = path.join(a.root, b.slug, "README.md");
      const t = fs.existsSync(readme) ? fs.readFileSync(readme, "utf8").trim() : b.text;
      return { ...b, text: `${t}\n\n\`[펼치려면: ${b.slug} 전문]\``, label: "README만(예산↓)" };
    });
    note = est() > a.budget
      ? `\n\n> ⚠ 예산(${a.budget}) 초과 — T1을 README로 강등했으나 여전히 ~${est()} tok. 타깃만으로도 큼: --budget 상향 또는 --depth 0.`
      : `\n\n> ℹ 예산 맞춤 위해 T1을 README-only로 강등(~${est()} tok).`;
  }

  const body = blocks.map((b) => `## \`${b.slug}\` — ${b.label}\n\n${b.text}`).join("\n\n---\n\n");
  console.log([`${header}  ·  ~${est()} tok`, mapBlock, body].join("\n\n") + note);
}

main();
