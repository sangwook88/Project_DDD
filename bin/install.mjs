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
// 참조하므로, 복사하면서 그 토큰을 위치 독립 참조로 치환해 자급자족시킨다(전역은 ~/.claude,
// --project 는 프로젝트-상대 .claude — 둘 다 사용자 절대경로를 안 박는다. BUNDLE_FWD 참고).

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

// 리소스(docs·scripts·templates)는 .claude/ 바로 밑에 평탄하게 깔린다(예전엔 .claude/fe-be-ddd/
// 아래였다 — 그 래퍼 층을 없앴다). LEGACY_BUNDLE 은 옛 설치본 감지·청소용으로만 남긴다.
const LEGACY_BUNDLE = join(claudeRoot, BUNDLE_NAME);
const AGENTS_DST = join(claudeRoot, "agents");
const SKILLS_DST = join(claudeRoot, "skills");

// 토큰이 치환될 참조 경로. 스킬/에이전트 본문의 ${DDD_ROOT}·${DDD_HOME}는 마크다운
// 링크(에이전트가 읽음)와 `pwsh "${DDD_ROOT}/scripts/..."` 명령(셸이 실행) 양쪽에 쓰인다.
// 리소스가 .claude/ 바로 밑으로 평탄화돼 ${DDD_ROOT}(리소스)·${DDD_HOME}(.claude)는 같은 값이
// 된다. 어느 스코프든 머신·사용자 절대경로(C:/Users/<id>/…)를 박지 않는 위치 독립 참조를 쓴다:
//   - --project 설치: 프로젝트 루트 기준 상대경로(.claude). 에이전트 cwd(= 대상 프로젝트
//     루트)에서 해석되고, .claude/ 를 통째로 커밋·이식해도 깨지지 않는다.
//   - 전역 설치: 홈 기준 ~/.claude . 셸은 `~`를 펼치고(위치 인자 형태에서 동작) 에이전트는
//     마크다운 링크의 `~`를 홈으로 해석한다. 사용자명이 박히지 않아 머신 간에도 이식된다.
const REF_ROOT = PROJECT ? ".claude" : "~/.claude";
const BUNDLE_FWD = REF_ROOT;   // ${DDD_ROOT} — 리소스(.claude/{docs,scripts,templates}) 참조
const CLAUDE_FWD = REF_ROOT;   // ${DDD_HOME} — 디스커버리 루트(.claude) 참조

// .claude/ 바로 밑에 평탄 복사되는 리소스 디렉터리(화이트리스트). agents/·skills/ 는 평탄
// 사본이 정본이라 제외 — 상호참조는 ${DDD_HOME}/{agents,skills}/… 로 그 정본을 가리킨다.
const BUNDLE_DIRS = ["docs", "scripts", "templates"];

// 백업은 discovery 루트(agents/·skills/) 밖에 둔다 — 안에 두면 백업이 그대로
// 스킬로 로드돼 유령이 증식한다. 리소스 디렉터리도 재설치마다 우리 파일이 갱신되므로 피한다.
const BACKUPS = join(claudeRoot, `.${BUNDLE_NAME}-backups`);
const RUN_TS = String(Date.now());                 // 한 번의 실행은 같은 타임스탬프 폴더로
const BAK_RE = /\.bak-\d+$/;                        // 옛 버전이 남긴 유령 백업 이름 패턴

const log = (...a) => console.log(...a);
const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules"]);

// 토큰 치환: ${DDD_ROOT}·${DDD_HOME} → 둘 다 디스커버리 루트(.claude). 참조 형태는 설치
// 스코프에 따라 프로젝트-상대(.claude, --project)·홈-상대(~/.claude, 전역)로 갈린다 — REF_ROOT 참고.
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

// SRC 화이트리스트 디렉터리(docs·scripts·templates) 안 모든 파일을 SRC 기준 상대경로로 나열.
// 평탄 설치/제거가 "우리 소유 파일"만 건드리도록 — 사용자 동명 폴더(.claude/docs 등)는 보존.
function listResourceFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = join(SRC, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const r = join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else out.push(r);
    }
  };
  for (const d of BUNDLE_DIRS) walk(d);
  return out;
}

// 디렉터리가 존재하고 비어 있으면 지운다(사용자 파일이 있으면 보존). 지웠으면 true.
function rmDirIfEmpty(p) {
  if (!existsSync(p) || statSync(p).isDirectory() === false || readdirSync(p).length !== 0) return false;
  if (!DRY) rmSync(p, { recursive: true, force: true });
  return true;
}

// p 아래 빈 디렉터리를 bottom-up 으로 모두 지우고, 마지막에 p 자신도 비었으면 지운다(사용자 파일 보존).
function pruneEmptyTree(p) {
  if (!existsSync(p) || statSync(p).isDirectory() === false) return;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmptyTree(join(p, e.name));
  }
  rmDirIfEmpty(p);
}

// 리소스 제거 후 .claude/{docs,templates,scripts} 에 남은 빈 디렉터리를 정리한다(사용자 파일 보존).
function pruneEmptyDirs(root) {
  for (const d of BUNDLE_DIRS) pruneEmptyTree(join(root, d));
}

// 설치본 감지: 새 평탄 레이아웃의 마커(scripts/implement.ps1) 또는 옛 fe-be-ddd/ 잔재.
function hasInstall(root) {
  return existsSync(join(root, "scripts", "implement.ps1")) || existsSync(join(root, BUNDLE_NAME));
}

function doUninstall() {
  // 제거 대상 루트 결정. --project 가 명시되면 그 루트만, 아니면 전역/현재 프로젝트를 감지한다.
  // (설치 기본은 전역이지만, cwd 프로젝트에만 깔려 있으면 그걸 지운다 — 설치/제거 비대칭 해소.)
  const globalRoot = join(homedir(), ".claude");
  const cwdRoot = resolve(process.cwd(), ".claude");
  let target;
  if (PROJECT) {
    target = claudeRoot;
  } else {
    const projectHas = cwdRoot !== globalRoot && hasInstall(cwdRoot);
    target = (!hasInstall(globalRoot) && projectHas) ? cwdRoot : globalRoot;
  }

  log(`\n  Uninstalling fe-be-ddd from ${target}\n`);
  const removed = removeFrom(target);
  if (removed === 0) log(`  Nothing to remove — no fe-be-ddd install found here.`);

  // 다른 위치(전역↔프로젝트)에도 설치본이 있으면 그 제거 명령을 안내한다.
  const other = target === globalRoot ? cwdRoot : globalRoot;
  if (other !== target && hasInstall(other)) {
    const cmd = other === globalRoot
      ? "npx github:lsc892/Project_DDD --uninstall"
      : "npx github:lsc892/Project_DDD --uninstall --project .";
    log(`\n  Another install also exists at ${other}`);
    log(`  Remove it with:  ${cmd}`);
  }
  log(DRY ? "\n  (dry-run — nothing removed)\n" : "\n  Done.\n");
}

// 한 루트에서 fe-be-ddd 설치본(평탄 리소스·옛 번들·평탄 agents/skills·유령백업·백업폴더)을
// 지운다. 리소스는 우리 소유 파일만 골라 지우고 빈 디렉터리만 정리한다(사용자 파일 보존). 지운 개수 반환.
function removeFrom(root) {
  const agentsDst = join(root, "agents");
  const skillsDst = join(root, "skills");
  const backups = join(root, `.${BUNDLE_NAME}-backups`);
  let n = 0;

  // 1) 평탄 리소스 — 우리가 설치한 파일만 제거 + 빈 디렉터리 정리.
  let res = 0;
  for (const rel of listResourceFiles()) {
    const t = join(root, rel);
    if (!existsSync(t)) continue;
    if (!DRY) rmSync(t, { force: true });
    res++;
  }
  if (res) { log(`  - removed ${res} resource file(s) under .claude/{${BUNDLE_DIRS.join(",")}}/`); n += res; }
  if (!DRY) pruneEmptyDirs(root);

  // 2) 옛 레이아웃(.claude/fe-be-ddd/) 잔재 — 자기소유 폴더라 통째로.
  const legacy = join(root, BUNDLE_NAME);
  if (existsSync(legacy)) {
    log(`  - removed ${legacy.replace(root, ".claude")} (legacy)`);
    if (!DRY) rmSync(legacy, { recursive: true, force: true });
    n++;
  }

  // 3) 평탄 agents/skills 사본.
  const flat = [
    ...listAgents().map((f) => join(agentsDst, f)),
    ...listSkills().map((s) => join(skillsDst, s)),
  ];
  for (const t of flat) {
    if (!existsSync(t)) continue;
    log(`  - removed ${t.replace(root, ".claude")}`);
    if (!DRY) rmSync(t, { recursive: true, force: true });
    n++;
  }
  n += sweepGhostBaks(skillsDst, agentsDst, root);
  if (existsSync(backups)) {
    log(`  - removed ${backups.replace(root, ".claude")}`);
    if (!DRY) rmSync(backups, { recursive: true, force: true });
    n++;
  }

  // 우리 항목을 모두 걷어낸 뒤 비게 된 디렉터리 정리(사용자 파일이 남아 있으면 보존).
  // agents/·skills/ 는 우리 평탄 사본만 지웠으니, 비었다면 우리만 쓰던 것 → 껍데기 제거.
  // 마지막으로 .claude 루트도 통째로 비었으면 함께 지운다.
  for (const p of [agentsDst, skillsDst]) {
    if (rmDirIfEmpty(p)) log(`  - removed ${p.replace(root, ".claude")} (empty)`);
  }
  if (rmDirIfEmpty(root)) log(`  - removed ${root} (empty)`);
  return n;
}

// agents/·skills/ 안에 남은 *.bak-<ts> (옛 버전이 유령 스킬로 만든 백업)을 쓸어낸다.
function sweepGhostBaks(skillsDst = SKILLS_DST, agentsDst = AGENTS_DST, root = claudeRoot) {
  let n = 0;
  for (const dir of [skillsDst, agentsDst]) {
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir)) {
      if (!BAK_RE.test(e)) continue;
      const p = join(dir, e);
      log(`  - cleaned ghost backup ${p.replace(root, ".claude")}`);
      if (!DRY) rmSync(p, { recursive: true, force: true });
      n++;
    }
  }
  return n;
}

function doInstall() {
  log(`\n  Installing fe-be-ddd → ${claudeRoot}\n`);

  // 1) 리소스 = ${DDD_ROOT} 대체본. 화이트리스트(docs·scripts·templates)만 .claude/ 바로 밑에
  //    평탄 복사 — agents/·skills/(평탄 사본과 중복), bin/·LICENSE·package.json·README.md(잡파일) 제외.
  if (!DRY) {
    rmSync(LEGACY_BUNDLE, { recursive: true, force: true });   // 옛 .claude/fe-be-ddd/ 잔재 청소(마이그레이션)
    for (const rel of listResourceFiles()) {                   // 우리 옛 사본만 비우고 새로 복사(사용자 파일 보존)
      const t = join(claudeRoot, rel);
      if (existsSync(t)) rmSync(t, { force: true });
    }
    for (const d of BUNDLE_DIRS) {
      const from = join(SRC, d);
      if (!existsSync(from)) continue;
      cpSync(from, join(claudeRoot, d), {
        recursive: true,
        // .git/.obsidian/node_modules 같은 잡파일은 하위에서도 제외.
        filter: (s) => !relative(SRC, s).split(/[\\/]/).some((seg) => SKIP_DIRS.has(seg)),
      });
      rewriteMdInPlace(join(claudeRoot, d));                   // 복사된 리소스 .md 토큰 치환
    }
    // 조용한 실패(0개 복사) 승격: 화이트리스트 디렉터리가 하나도 안 잡히면 빈 설치.
    if (!BUNDLE_DIRS.some((d) => existsSync(join(claudeRoot, d)))) {
      throw new Error(`resource copy failed: docs/scripts/templates not found under ${SRC}`);
    }
  }
  log(`  - resources .claude/{${BUNDLE_DIRS.join(",")}}/`);

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
