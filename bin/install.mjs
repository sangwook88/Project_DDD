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
const BUNDLE_FWD = BUNDLE.replace(/\\/g, "/");     // 마크다운/경로용 슬래시 정규화

// 백업은 discovery 루트(agents/·skills/) 밖에 둔다 — 안에 두면 백업이 그대로
// 스킬로 로드돼 유령이 증식한다. 번들(BUNDLE)도 재설치마다 통째로 지워지므로 피한다.
const BACKUPS = join(claudeRoot, `.${BUNDLE_NAME}-backups`);
const RUN_TS = String(Date.now());                 // 한 번의 실행은 같은 타임스탬프 폴더로
const BAK_RE = /\.bak-\d+$/;                        // 옛 버전이 남긴 유령 백업 이름 패턴

const log = (...a) => console.log(...a);
const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules"]);

// 토큰 치환: ${DDD_ROOT} → 번들 절대경로.
function rewrite(text) {
  return text.split("${DDD_ROOT}").join(BUNDLE_FWD);
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
  log(`\n  fe-be-ddd 제거 — ${claudeRoot}\n`);
  const targets = [
    BUNDLE,
    ...listAgents().map((f) => join(AGENTS_DST, f)),
    ...listSkills().map((s) => join(SKILLS_DST, s)),
  ];
  for (const t of targets) {
    if (!existsSync(t)) continue;
    log(`  - 삭제 ${t.replace(claudeRoot, ".claude")}`);
    if (!DRY) rmSync(t, { recursive: true, force: true });
  }
  sweepGhostBaks();          // 옛 버전이 discovery 안에 흘린 *.bak-* 유령까지 청소
  if (existsSync(BACKUPS)) {
    log(`  - 삭제 ${BACKUPS.replace(claudeRoot, ".claude")}`);
    if (!DRY) rmSync(BACKUPS, { recursive: true, force: true });
  }
  log(DRY ? "\n  (dry-run — 실제 삭제 안 함)\n" : "\n  완료.\n");
}

// agents/·skills/ 안에 남은 *.bak-<ts> (옛 버전이 유령 스킬로 만든 백업)을 쓸어낸다.
function sweepGhostBaks() {
  let n = 0;
  for (const root of [SKILLS_DST, AGENTS_DST]) {
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root)) {
      if (!BAK_RE.test(e)) continue;
      const p = join(root, e);
      log(`  - 유령 백업 정리 ${p.replace(claudeRoot, ".claude")}`);
      if (!DRY) rmSync(p, { recursive: true, force: true });
      n++;
    }
  }
  return n;
}

function doInstall() {
  log(`\n  fe-be-ddd 설치 — ${claudeRoot}  (접두사 없음)\n`);

  // 1) 리소스 번들 = ${DDD_ROOT} 대체본. 레포 전체에서 잡파일만 빼고 복사.
  if (!DRY) {
    rmSync(BUNDLE, { recursive: true, force: true });
    mkdirSync(BUNDLE, { recursive: true });
    cpSync(SRC, BUNDLE, {
      recursive: true,
      // 필터는 SRC 기준 "상대경로"로 검사한다. npx 캐시 경로(…/node_modules/fe-be-ddd)에
      // 박힌 node_modules가 복사 루트(rel="")를 걸러내 빈 번들이 깔리는 버그 방지.
      filter: (s) => {
        const rel = relative(SRC, s);
        return !rel.split(/[\\/]/).some((seg) => SKIP_DIRS.has(seg));
      },
    });
    rewriteMdInPlace(BUNDLE);                       // 번들 내부 .md 토큰도 치환
    // 조용한 실패(0개 복사) 승격: cpSync는 필터가 루트를 막아도 예외를 안 던진다.
    if (readdirSync(BUNDLE).length === 0) {
      throw new Error(`번들 복사 실패: ${BUNDLE} 가 비어있음 (filter가 복사 루트를 막았는지 확인)`);
    }
  }
  log(`  - 번들  .claude/${BUNDLE_NAME}/  (templates·scripts·docs)`);

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
    if (swept) log(`\n  - 유령 백업 ${swept}개 정리됨`);
  }

  log(DRY ? "\n  (dry-run — 실제 설치 안 함)\n" : "\n  완료. Claude Code 재시작 후 사용하세요.\n");
}

// 동명 항목이 이미 있고, 그게 우리 이전 설치본과 다를 때만(= 진짜 외부/수정본)
// discovery 밖으로 한 번 백업한다. 무변경 재설치는 백업 0개 → 유령 증식 차단.
function backupIfForeign(target, src, kind, name) {
  if (!existsSync(target)) return;
  if (matchesInstall(target, src)) return;   // 변경 안 된 우리 설치본 → 백업 불필요
  const bak = join(BACKUPS, RUN_TS, kind, name);
  log(`    (외부/수정 항목 백업 → ${bak.replace(claudeRoot, ".claude")})`);
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
  console.error("\n  설치 실패:", e.message, "\n");
  process.exit(1);
}
