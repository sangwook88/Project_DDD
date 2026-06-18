<#
.SYNOPSIS
    구현 티켓(tickets/NNNN-*.md) 1장을 구현 엔진(codex 기본 / claude)에 넘겨 새 브랜치에서 "구현만" 시킨다.
.DESCRIPTION
    자기완결 도메인 페이지(또는 티켓)를 입력으로: ① 프런트매터(branch/base/status/engine) 읽기
    ② base에서 branch 체크아웃 ③ 엔진을 헤드리스로 띄워 "이 티켓만 보고 구현". 커밋·푸시는 사람.
.PARAMETER Ticket   티켓 .md 경로 (Ticket 또는 Domain 중 하나 필수)
.PARAMETER Domain   도메인 페이지 .md 경로 (docs/domains/<name>.md). Ticket 대신 이걸 주면 도메인 계약서로 구현.
.PARAMETER Base     분기 기준. 미지정 시 입력 base, 없으면 main.
.PARAMETER Engine   codex | claude. 미지정 시 입력 engine, 없으면 codex.
.PARAMETER NoBranch 브랜치 안 따고 현재 브랜치에서.
.PARAMETER DryRun   무엇을 할지만 출력.
.EXAMPLE
    pwsh scripts/implement.ps1 -Ticket tickets/0001-foo.md
.EXAMPLE
    pwsh scripts/implement.ps1 -Domain docs/domains/auth.md
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Ticket,
    [string]$Domain,
    [string]$Base,
    [ValidateSet('codex', 'claude')][string]$Engine,
    [switch]$NoBranch,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
function Fail($m) { Write-Host "[implement] 오류: $m" -ForegroundColor Red; exit 1 }
function Info($m) { Write-Host "[implement] $m" -ForegroundColor Cyan }

$repo = (& git rev-parse --show-toplevel 2>$null); if (-not $repo) { Fail "git 리포가 아닙니다." }
$repo = $repo.Trim()

if ($Ticket -and $Domain) { Fail "-Ticket 과 -Domain 중 하나만 주세요." }
if ($Domain) { $inputPath = $Domain; $kind = '도메인 페이지' } elseif ($Ticket) { $inputPath = $Ticket; $kind = '티켓' } else { Fail "-Ticket 또는 -Domain 경로가 필요합니다." }
if (-not (Test-Path $inputPath)) { Fail "$kind 없음: $inputPath" }
$ticketFull = (Resolve-Path $inputPath).Path
$ticketRel = $ticketFull.Substring($repo.Length).TrimStart('\', '/') -replace '\\', '/'
$raw = Get-Content -Raw -Encoding UTF8 $ticketFull

$fm = @{}
$m = [regex]::Match($raw, '(?s)^\uFEFF?---\s*\r?\n(.*?)\r?\n---\s*\r?\n')
if ($m.Success) {
    foreach ($line in ($m.Groups[1].Value -split "`n")) {
        $kv = [regex]::Match($line, '^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*(#.*)?$')
        if ($kv.Success) { $fm[$kv.Groups[1].Value] = $kv.Groups[2].Value.Trim() }
    }
}
$branch = $fm['branch']
if (-not $Base) { $Base = $fm['base']; if (-not $Base) { $Base = 'main' } }
if (-not $Engine) { $Engine = $fm['engine']; if (-not $Engine) { $Engine = 'codex' } }
$status = $fm['status']
if ($status -eq 'draft') { Fail "티켓 status 가 'draft' — 미결 갈림길. status: ready 로 닫으세요." }
if ($Domain -and $raw -match '\[입력 필요') { Fail "도메인 페이지에 '[입력 필요]' 슬롯이 남아 있습니다 — 채운 뒤 다시 실행하세요." }
if (-not $NoBranch -and -not $branch) { Fail "프런트매터에 branch 가 없습니다. -NoBranch 를 쓰거나 branch: 를 채우세요." }
Info "${kind}: $ticketRel / 엔진: $Engine / status: $status"

$dirty = (& git -C $repo status --porcelain)
if ($dirty -and -not $DryRun) {
    Write-Host "[implement] 경고: 워킹 트리에 커밋 안 된 변경." -ForegroundColor Yellow
    $dirty | Select-Object -First 10 | ForEach-Object { Write-Host "    $_" }
    $ans = Read-Host "계속할까요? (y/N)"; if ($ans -notmatch '^[Yy]') { Fail "중단." }
}

if (-not $NoBranch) {
    $exists = (& git -C $repo branch --list $branch)
    if ($DryRun) { Info "[dry-run] base '$Base' → '$branch' 체크아웃" }
    elseif ($exists) { Info "'$branch' 존재 → 체크아웃"; & git -C $repo checkout $branch | Out-Null }
    else {
        Info "base '$Base' 에서 '$branch' 생성"
        & git -C $repo fetch origin $Base --quiet 2>$null
        & git -C $repo checkout -b $branch $Base | Out-Null
        if ($LASTEXITCODE -ne 0) { Info "base '$Base' 없음 → 현재 HEAD 에서 분기"; & git -C $repo checkout -b $branch | Out-Null }
    }
}
$curBranch = (& git -C $repo rev-parse --abbrev-ref HEAD).Trim()
Info "작업 브랜치: $curBranch"

$prompt = @"
너는 이 리포에서 $kind 1장을 구현하는 에이전트다. 지금 브랜치는 '$curBranch'.
읽을 ${kind}: $ticketRel
규약 SoT: docs/arch/ARCHITECTURE.md (먼저 읽어라).
규칙(엄수):
1. $kind 를 끝까지 읽고 「구현목표/수용기준」(또는 「변경 대상」「인터페이스·시그니처」「엣지 케이스」)대로만 구현한다.
2. 「경계 — 하지 말 것」을 절대 어기지 않는다: 지정 범위 밖 수정·재설계·리네이밍·겸사겸사 리팩터·새 의존 추가 금지. 의존 도메인은 읽기만.
3. 코드 영문 / 주석·문서 한국어. 명명·직렬화는 ARCHITECTURE 컨벤션을 따른다.
4. 「수용 기준」을 모두 충족한다(엣지 케이스 행이 있으면 각 행도).
5. 모호해 추측이 필요하거나 '[입력 필요]' 슬롯이 남았으면 구현하지 말고 무엇이 막혔는지 한국어로 보고하고 멈춘다.
6. 끝나면 변경 요약 + 수용 기준 충족 여부 + (해당되면) 일지에 남길 결정 1줄을 보고한다. push 는 하지 마라.
지금 $kind 를 구현하라.
"@

function Resolve-Bin([string[]]$names) {
    foreach ($n in $names) { $c = Get-Command $n -ErrorAction SilentlyContinue; if ($c) { return $c.Source } }
    return $null
}
if ($DryRun) { Info "[dry-run] 엔진=$Engine. 프롬프트:"; Write-Host $prompt; exit 0 }

if ($Engine -eq 'codex') {
    $bin = Resolve-Bin @('codex', 'codex.cmd', 'codex.exe')
    if (-not $bin) { Fail "codex 실행 파일을 못 찾음. PATH 확인 또는 -Engine claude." }
    Info "codex 실행 (workspace-write)..."
    & $bin 'exec' '--cd' $repo '--sandbox' 'workspace-write' $prompt
}
else {
    $bin = Resolve-Bin @('claude', 'claude.cmd', 'claude.exe')
    if (-not $bin) { Fail "claude 실행 파일을 못 찾음. PATH 확인 또는 -Engine codex." }
    Info "claude 실행 (헤드리스)..."
    & $bin '-p' $prompt
}
$code = $LASTEXITCODE
Write-Host ""
if ($code -eq 0) { Info "엔진 종료(exit 0). 'git -C `"$repo`" diff' 로 검토 후 커밋·푸시는 직접." }
else { Write-Host "[implement] 엔진 비정상 종료(exit $code)." -ForegroundColor Yellow }
exit $code
