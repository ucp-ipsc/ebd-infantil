# EBD Infantil · Igreja Presbiteriana de São Carlos

Site público com 52 aulas e 12 trilhas da Grande História da Bíblia, calendário, busca e materiais com acesso restrito.

## Acessos

- Famílias podem consultar as histórias e as passagens sem login.
- **IPSC_UCP** consulta e baixa os materiais após entrar.
- **LIDERANCA_IPSC_UCP** também pode editar e publicar o planejamento.

As senhas não estão no repositório. A verificação ocorre no Worker Cloudflare, com hashes de senha e chave de sessão guardados como secrets. As sessões duram 30 minutos e ficam somente na memória da aba; recarregar a página ou sair exige novo login. O botão Sair remove a sessão da aba. Uma sessão já emitida expira em até 30 minutos; trocar SESSION_SECRET invalida todas imediatamente.

## Editar e publicar

1. Clique em Planejamento e entre com o acesso da liderança.
2. Escolha uma aula, ajuste os textos ou troque sua data com outra aula.
3. Clique em Salvar no rascunho.
4. Clique em Publicar alterações e confirme a revisão.

O serviço grava apenas `dados/planejamento.js` no repositório. O GitHub Actions atualiza o site após o commit. Se outra pessoa tiver publicado desde a abertura do editor, a gravação é rejeitada; exporte seu rascunho, carregue a versão atual e revise suas alterações. Exportar/importar e impressão continuam disponíveis. Rascunhos não são sincronizados entre dispositivos.

## Materiais privados

Os 57 PDFs ficam no repositório privado `ucp-ipsc/ebd-infantil-arquivo`, junto do histórico anterior. Este repositório público não deve conter PDFs, nem commits anteriores que os incluam. O catálogo público `dados/materiais.js` contém os títulos, as associações, tamanhos e hashes, mas não os arquivos.

O Worker busca somente arquivos permitidos no catálogo interno, verifica a sessão e transmite o PDF sem expor o token do GitHub ou uma URL privada de origem. Há sugestões de recursos para 32 das 52 aulas; vinte aulas ainda precisam de materiais. As associações devem ser revistas pelos professores. Os arquivos preservam os créditos originais da editora.

Para acrescentar material, coloque-o no acervo privado; atualize o catálogo público e `backend/catalog.json`; depois publique novamente o Worker. `tools/organizar_acervo.py` documenta a curadoria inicial e não deve ser usado para enviar PDFs a este repositório público.

## Serviço de acesso

Código: `backend/worker.mjs`. Configuração sem segredos: `backend/wrangler.json`. Endereço público do serviço: `dados/acesso.js`.

Secrets necessários na Cloudflare:

- `MATERIAL_PASSWORD_HASH` e `COORD_PASSWORD_HASH`: sal aleatório e hash PBKDF2-SHA256, em base64 separados por dois-pontos.
- `SESSION_SECRET`: chave aleatória para assinar sessões.
- `GITHUB_TOKEN`: fine-grained token da conta ucp-ipsc, limitado aos repositórios do site e do acervo, com Contents: Read and write. Renove antes da data de expiração escolhida no GitHub. Não use o token amplo do GitHub CLI.

Os limites de tentativas são aplicados pelo Worker. O limite nativo da Cloudflare é aproximado e separado por localização, não um bloqueio global por conta.

`backend/configurar-senhas.cjs` recebe senhas sem eco por stdin e grava somente hashes e uma chave de sessão no secret store. A credencial do GitHub pode ser atualizada diretamente em Workers → ipsc-ebd-acesso → Settings → Variables and Secrets. Nunca coloque valores secretos em `vars`, arquivos públicos ou commits.

## Desenvolvimento e verificação

- `node tools/servidor.cjs`: prévia local.
- `node tools/validar.cjs`: calendário, catálogo e integridade de PDFs locais, se presentes.
- `node --test backend/worker.test.mjs`: autenticação, permissões, conflitos e escrita limitada ao calendário.
- `node tools/testar-interface.cjs`: testes de navegador com Playwright e serviço simulado; não grava no GitHub real.
- No diretório backend: `pnpm install --frozen-lockfile` e `pnpm exec wrangler deploy` para atualizar o serviço autenticado.

A prévia local não tem acesso ao serviço de produção, cujo CORS aceita somente o domínio público da igreja. Os testes de interface simulam a API para verificar os dois acessos. O workflow do Pages publica apenas HTML, CSS, JavaScript, ícone e dados; não publica o backend, os PDFs ou as ferramentas de configuração.
