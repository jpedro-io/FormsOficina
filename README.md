# Workspace Integrado

Formulário da oficina em HTML, CSS e JavaScript, com API serverless TypeScript e PostgreSQL no Neon.

## Funcionamento e segurança

- O navegador envia somente os cinco campos previstos no briefing para `/api/inscricoes`, na mesma origem. A chave do Neon nunca chega ao navegador.
- A API valida os dados novamente, verifica o CPF, limita as requisições, usa consultas SQL parametrizadas e não tem rota para consultar inscrições.
- O banco impede mais de uma resposta por CPF e restringe a avaliação ao intervalo de 0 a 5.
- O limite permanece ativo sem uma variável adicional: quando `RATE_LIMIT_SECRET` não existe, a API usa `DATABASE_URL` como chave HMAC, somente no servidor. O banco guarda o hash do endereço, não o IP em texto aberto.
- A confirmação de sucesso aparece somente após a gravação. Erros internos não são expostos ao navegador.

## Desenvolvimento local

1. Execute `db/schema.sql` no banco Neon.
2. Defina `DATABASE_URL` em `.env` ou `.env.local`, na raiz do projeto, ao lado de `package.json` e `dev-server.mjs`. `.env.local` prevalece sobre `.env`. Não compartilhe nem versione esses arquivos. Exemplo: `DATABASE_URL=postgresql://...` (uma linha; não publique o valor).
3. Rode `npm install` e `npm run dev`. No início, o terminal informa se a URL foi carregada, sem exibir o segredo. O formulário local pode enviar usando apenas `DATABASE_URL`; ele continua com validação, limite de requisições e restrição de CPF. A página informa que as respostas válidas serão gravadas no banco configurado.
4. Se `/api/status` retornar `ready:false` e `localDevelopment:true`, o modo local está ativo, mas o processo não recebeu uma `DATABASE_URL` válida/longa o suficiente. No Windows, confirme com `Get-ChildItem -Force -Name .env*` que o arquivo não se chama `.env.txt`. Salve-o e reinicie o servidor para reler as variáveis.
5. Após editar `api/inscricoes.ts`, pare o servidor com Ctrl+C e rode `npm run dev` de novo. O script limpa e recompila `.cache/local-build` a partir dos arquivos em `api/`. Não edite `.cache/local-build`, pois é gerada.

## Produção no Vercel

Em produção, a API também exige `CRON_SECRET`, `TERMS_OF_USE_URL` e `PRIVACY_POLICY_URL`. Configure-os como variáveis server-side no Vercel e faça novo deploy. Os links legais precisam apontar para páginas aprovadas em HTTPS. `PUBLIC_SITE_ORIGIN` é opcional, mas recomendado para restringir a origem.

A rotina diária de limpeza em `vercel.json` usa a autorização automática do Vercel Cron com `CRON_SECRET`. Ela remove hashes de rate limit com mais de 24 horas.

## Antes de coletar dados reais

O briefing pede uma Política de Privacidade, mas não traz seu texto, responsável pelo tratamento, contato ou prazo de retenção. Esses dados não foram inventados. A política e os Termos de Uso devem ser aprovados e apresentados antes da publicação. A política também deve informar o uso do hash de IP para controle de abuso.

## Identidade visual

A marca horizontal completa do IFBA aparece no cabeçalho, usando a versão branca oficial sobre fundo escuro. O arquivo foi obtido da página oficial de marcas do Instituto: https://portal.ifba.edu.br/dgcom/documentos-e-manuais/manuais
