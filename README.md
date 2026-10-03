# Workspace Integrado

Formulário da oficina em HTML, CSS e JavaScript, com API serverless TypeScript e PostgreSQL no Neon.

## Configuração necessária

A única variável obrigatória para receber inscrições, tanto localmente quanto em produção, é `DATABASE_URL`. Ela deve existir somente no servidor e nunca ser colocada no JavaScript do navegador ou publicada no GitHub.

- No desenvolvimento local, defina `DATABASE_URL` em `.env` ou `.env.local`, na raiz do projeto, ao lado de `package.json` e `dev-server.mjs`. `.env.local` prevalece sobre `.env`.
- Na Vercel, configure `DATABASE_URL` como variável server-side no ambiente Production e faça novo deploy.
- Aplique `db/schema.sql` no banco Neon antes de testar gravações.

## Limites e tarefas automáticas

- O limite de requisições continua ativo. `RATE_LIMIT_SECRET` é opcional; se não estiver configurada, a API usa `DATABASE_URL` como chave HMAC server-side.
- `CRON_SECRET` é opcional para o formulário. Se estiver configurada com pelo menos 32 caracteres, autoriza a tarefa diária de limpeza de registros antigos de rate limit, definida em `vercel.json`.
- Sem `CRON_SECRET`, o formulário continua funcionando e a chamada agendada de limpeza é ignorada. A API também remove registros antigos durante novos envios.
- `PUBLIC_SITE_ORIGIN` é opcional e pode restringir a origem permitida em produção.

## Desenvolvimento local

1. Execute `db/schema.sql` no banco Neon.
2. Defina `DATABASE_URL` em `.env` ou `.env.local`.
3. Rode `npm install` e `npm run dev`. O terminal informa se a variável foi carregada, sem exibir o valor.
4. Após editar `api/inscricoes.ts`, pare o servidor com Ctrl+C e rode `npm run dev` de novo. O script limpa e recompila `.cache/local-build` a partir dos arquivos em `api/`. Não edite `.cache/local-build`, pois é gerada.

## Segurança implementada

- O navegador envia somente os campos do formulário para `/api/inscricoes`; credenciais do banco ficam no servidor.
- A API verifica a origem, limita o tamanho do corpo, normaliza e valida os dados, valida o CPF e usa consultas SQL parametrizadas.
- Há uma resposta por CPF. Os limites de requisição usam um HMAC do endereço de origem; o IP em texto aberto não é gravado na tabela de rate limit.
- Erros internos do banco não são expostos ao navegador.
