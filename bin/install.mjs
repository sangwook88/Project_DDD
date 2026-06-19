#!/usr/bin/env node
// fe-be-ddd 설치기 — 접두사 없이 ~/.claude 에 직접 설치한다(플러그인 아님).
//
//   설치:    npx github:lsc892/Project_DDD
//   제거:    npx github:lsc892/Project_DDD --uninstall
//   미리보기: npx github:lsc892/Project_DDD --dry-run
//   사용자 대신 프로젝트(.claude)에 설치: --project [경로]
//
// 핵심: ~/.claude/agents·~/.claude/skills 에 놓인 "맨 파일"은 네임스페이스 접두가
// 붙지 않는다. 다만 스킬/에이전트는 템플릿·스크립트·규약을 ${DDD_ROOT} 토큰으로
// 참조하므로, 복사하면서 그 토큰을 번들 절대경로로 치환해 자급자족시킨다.

import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_NAME = "fe-be-ddd";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const DRY = flag("--dry-run");
const UNINSTALL = flag("--uninstall");
const PROJECT = flag("--project");

// 설치 루트: 기본은 사용자 ~/.claude, --project 면 대상 프로젝트의 .claude
let claudeRoot;
if (PROJECT) {
  const i = args.indexOf("--project");
  const base = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : process.cwd();
  claudeRoot = resolve(base, ".claude");
} else {
  claudeRoot = join(homedir(), ".claude");
}

const BUNDLE = join(claudeRoot, BUNDLE_NAME);      // ${DDD_ROOT} 대체 (절대 리소스 루트)
const AGENTS_DST = join(claudeRoot, "agents");
const SKILLS_DST = join(claudeRoot, "skills");
const BUNDLE_FWD = BUNDLE.replace(/\\/g, "/");     // ${DDD_ROOT} — 번들(리소스) 절대경로
const CLAUDE_FWD = claudeRoot.replace(/\\/g, "/"); // ${DDD_HOME} — 디스커버리 루트(.claude)

// 번들에는 ${DDD_ROOT} 가 실제 참조하는 리소스만 담는다(화이트리스트).
// agents/·skills/ 는 평탄 사본(.claude/agents·skills)이 정본이므로 번들에서 제외 →
// 상호참조는 ${DDD_HOME}/{agents,skills}/… 로 그 정본을 가리킨다(중복 보관 안 함).
const BUNDLE_DIRS = ["docs", "scripts", "templates"];

// 백업은 discovery 루트(agents/·skills/) 밖에 둔다 — 안에 두면 백업이 그대로
// 스킬로 로드돼 유령이 증식한다. 번들(BUNDLE)도 재설치마다 통째로 지워지므로 피한다.
const BACKUPS = join(claudeRoot, `.${BUNDLE_NAME}-backups`);
const RUN_TS = String(Date.now());                 // 한 번의 실행은 같은 타임스탬프 폴더로
const BAK_RE = /\.bak-\d+$/;                        // 옛 버전이 남긴 유령 백업 이름 패턴

const log = (...a) => console.log(...a);
const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules"]);

// 토큰 치환: ${DDD_ROOT} → 번들(리소스) 절대경로, ${DDD_HOME} → 디스커버리 루트(.claude).
function rewrite(text) {
  return text.split("${DDD_ROOT}").join(BUNDLE_FWD).split("${DDD_HOME}").join(CLAUDE_FWD);
}

function rewriteMdInPlace(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rewriteMdInPlace(p);
    else if (e.name.endsWith(".md")) writeFileSync(p, rewrite(readFileSync(p, "utf8")));
  }
}

function listAgents() {
  return readdirSync(join(SRC, "agents")).filter((f) => f.endsWith(".md"));
}
function listSkills() {
  return readdirSync(join(SRC, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
}

function doUninstall() {
  log(`\n  Uninstalling fe-be-ddd from ${claudeRoot}\n`);
  const targets = [
    BUNDLE,
    ...listAgents().map((f) => join(AGENTS_DST, f)),
    ...listSkills().map((s) => join(SKILLS_DST, s)),
  ];
  for (const t of targets) {
    if (!existsSync(t)) continue;
    log(`  - removed ${t.replace(claudeRoot, ".claude")}`);
    if (!DRY) rmSync(t, { recursive: true, force: true });
  }
  sweepGhostBaks();          // 옛 버전이 discovery 안에 흘린 *.bak-* 유령까지 청소
  if (existsSync(BACKUPS)) {
    log(`  - 삭제 ${BACKUPS.replace(claudeRoot, ".claude")}`);
    if (!DRY) rmSync(BACKUPS, { recursive: true, force: true });
  }
  log(DRY ? "\n  (dry-run — nothing removed)\n" : "\n  Done.\n");
}

// agents/·skills/ 안에 남은 *.bak-<ts> (옛 버전이 유령 스킬로 만든 백업)을 쓸어낸다.
function sweepGhostBaks() {
  let n = 0;
  for (const root of [SKILLS_DST, AGENTS_DST]) {
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root)) {
      if (!BAK_RE.test(e)) continue;
      const p = join(root, e);
      log(`  - cleaned ghost backup ${p.replace(claudeRoot, ".claude")}`);
      if (!DRY) rmSync(p, { recursive: true, force: true });
      n++;
    }
  }
  return n;
}

function doInstall() {
  log(`\n  Installing fe-be-ddd → ${claudeRoot}\n`);

  // 1) 리소스 번들 = ${DDD_ROOT} 대체본. 화이트리스트(docs·scripts·templates)만 복사 —
  //    agents/·skills/(평탄 사본과 중복), bin/·LICENSE·package.json·README.md(잡파일) 제외.
  if (!DRY) {
    rmSync(BUNDLE, { recursive: true, force: true });
    mkdirSync(BUNDLE, { recursive: true });
    for (const d of BUNDLE_DIRS) {
      const from = join(SRC, d);
      if (!existsSync(from)) continue;
      cpSync(from, join(BUNDLE, d), {
        recursive: true,
        // .git/.obsidian/node_modules 같은 잡파일은 하위에서도 제외.
        filter: (s) => !relative(SRC, s).split(/[\\/]/).some((seg) => SKIP_DIRS.has(seg)),
      });
    }
    rewriteMdInPlace(BUNDLE);                       // 번들 내부 .md 토큰도 치환
    // 조용한 실패(0개 복사) 승격: 화이트리스트 디렉터리가 하나도 안 잡히면 빈 번들.
    if (readdirSync(BUNDLE).length === 0) {
      throw new Error(`bundle copy failed: ${BUNDLE} is empty (docs/scripts/templates not found under ${SRC})`);
    }
  }
  log(`  - bundle .claude/${BUNDLE_NAME}/  (${BUNDLE_DIRS.join("·")})`);

  // 2) 디스커버리 사본: 에이전트 → ~/.claude/agents (맨이름), 스킬 → ~/.claude/skills.
  if (!DRY) { mkdirSync(AGENTS_DST, { recursive: true }); mkdirSync(SKILLS_DST, { recursive: true }); }

  for (const f of listAgents()) {
    log(`  - agent  .claude/agents/${f}`);
    if (DRY) continue;
    backupIfForeign(join(AGENTS_DST, f), join(SRC, "agents", f), "agents", f);
    writeFileSync(join(AGENTS_DST, f), rewrite(readFileSync(join(SRC, "agents", f), "utf8")));
  }

  for (const s of listSkills()) {
    log(`  - skill  .claude/skills/${s}/`);
    if (DRY) continue;
    const dst = join(SKILLS_DST, s);
    backupIfForeign(dst, join(SRC, "skills", s), "skills", s);
    rmSync(dst, { recursive: true, force: true });
    cpSync(join(SRC, "skills", s), dst, { recursive: true });
    rewriteMdInPlace(dst);
  }

  // 옛 버전이 discovery 안에 흘린 *.bak-* 유령을 이참에 청소(현재 증식분 회수).
  if (!DRY) {
    const swept = sweepGhostBaks();
    if (swept) log(`\n  - cleaned ${swept} ghost backup(s)`);
  }

  if (DRY) { log("\n  (dry-run — nothing installed)\n"); return; }

  if (PROJECT) {
    log(`\n  Done — installed to ${claudeRoot}`);
    log(`  Scope: this project only (active when Claude Code opens this folder).`);
  } else {
    log(`\n  Done — installed to ${claudeRoot}`);
    log(`  Scope: global (available in every project).`);
    log(`  No files were created in your current folder — that's expected;`);
    log(`  outputs like docs/ and tickets/ appear when you use a skill.`);
    log(`  To install into a single project instead:  npx github:lsc892/Project_DDD --project .`);
  }
  log(`  Restart Claude Code to apply.\n`);
}

// 동명 항목이 이미 있고, 그게 우리 이전 설치본과 다를 때만(= 진짜 외부/수정본)
// discovery 밖으로 한 번 백업한다. 무변경 재설치는 백업 0개 → 유령 증식 차단.
function backupIfForeign(target, src, kind, name) {
  if (!existsSync(target)) return;
  if (matchesInstall(target, src)) return;   // 변경 안 된 우리 설치본 → 백업 불필요
  const bak = join(BACKUPS, RUN_TS, kind, name);
  log(`    (backed up foreign/modified item → ${bak.replace(claudeRoot, ".claude")})`);
  mkdirSync(dirname(bak), { recursive: true });
  cpSync(target, bak, { recursive: true });
}

// target 이 "이번에 설치할 내용"과 바이트 단위로 같은가? (.md 는 ${DDD_ROOT} 치환 후 비교)
function matchesInstall(target, src) {
  const sStat = statSync(src), tStat = statSync(target);
  if (sStat.isDirectory() !== tStat.isDirectory()) return false;
  if (!sStat.isDirectory()) {
    const want = src.endsWith(".md")
      ? Buffer.from(rewrite(readFileSync(src, "utf8")))
      : readFileSync(src);
    return readFileSync(target).equals(want);
  }
  const sNames = readdirSync(src).sort();
  const tNames = readdirSync(target).sort();
  if (sNames.length !== tNames.length || sNames.some((n, i) => n !== tNames[i])) return false;
  return sNames.every((n) => matchesInstall(join(target, n), join(src, n)));
}

try {
  if (UNINSTALL) doUninstall();
  else doInstall();
} catch (e) {
  console.error("\n  Install failed:", e.message, "\n");
  process.exit(1);
}
