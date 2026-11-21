param([string]$RepositoryName = 'ebd-infantil')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$login = & gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $login.Trim().ToLowerInvariant() -ne 'ucp-ipsc') { throw 'Entre no GitHub CLI com a conta ucp-ipsc.' }
$expectedRemote = "https://github.com/ucp-ipsc/$RepositoryName.git"
$remote = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -ne $expectedRemote) { throw 'Confira o checkout e o remote antes de publicar.' }
$trackedPdfs = & git ls-files '*.pdf'
if ($trackedPdfs) { throw 'Este checkout contém PDFs rastreados. Use o checkout público sem o histórico dos materiais.' }
& node tools/validar.cjs
if ($LASTEXITCODE -ne 0) { throw 'Validação do calendário falhou.' }
& node --test backend/worker.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Validação do serviço falhou.' }
& git add -- index.html style.css app.js access.js icone.svg dados tools backend package.json README.md .gitignore .gitattributes .github
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar arquivos.' }
& git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { & git commit -m 'Atualiza o site da EBD'; if ($LASTEXITCODE -ne 0) { throw 'Falha no commit.' } }
& git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Falha no envio. Confira alterações remotas antes de tentar novamente.' }
Write-Output "Acompanhe em https://github.com/ucp-ipsc/$RepositoryName/actions"
