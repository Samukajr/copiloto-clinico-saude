# Meu ChatGPT - Workspace Inicial

Projeto full-stack para iniciar um clone de ChatGPT localmente, com:

- Frontend React + Vite + TypeScript
- Backend Node.js + Express
- Integração com OpenAI via endpoint `/api/chat`
- Persistência local de conversa no navegador
- Limite de taxa por IP e validação de payload
- Modo clinico para reabilitacao, transicao e paliativos

## Configuracao

- Copie o arquivo de exemplo de ambiente:

```bash
copy .env.example .env
```

- Edite `.env` e preencha `OPENAI_API_KEY`.

- Opcional: para testar sem chave, use `DEMO_MODE=true`.

- Instale dependencias:

```bash
npm install
```

## Desenvolvimento

Executa frontend e backend ao mesmo tempo:

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:8787/api/health>

## Scripts

- `npm run dev`: sobe frontend e backend
- `npm run dev:client`: sobe apenas frontend
- `npm run dev:server`: sobe apenas backend
- `npm run build`: build de producao do frontend
- `npm run lint`: validacao de lint
- `npm run start`: inicia apenas API em modo sem watch
- `npm run functions:install`: instala dependencias da pasta `functions`
- `npm run firebase:deploy`: build do frontend e deploy de hosting + functions
- `npm run firebase:deploy:hosting`: build do frontend e deploy apenas do hosting

## Variaveis de Ambiente

- `OPENAI_API_KEY`: chave da OpenAI
- `OPENAI_MODEL`: modelo de chat (padrao: `gpt-4.1-mini`)
- `OPENAI_TIMEOUT_MS`: timeout da chamada ao provedor
- `MAX_INPUT_CHARS`: limite de caracteres por mensagem
- `MAX_MESSAGES`: quantidade maxima de mensagens enviadas ao modelo
- `RATE_LIMIT_WINDOW_MS`: janela do rate limit
- `RATE_LIMIT_MAX_REQUESTS`: maximo de requisicoes por IP na janela
- `DEMO_MODE`: quando `true`, responde sem depender da OpenAI
- `PORT`: porta da API

## Proximo Passo Natural

- Persistir historico de conversa com banco (ex.: PostgreSQL + Prisma).

## Modo 100% Gratuito (Opcional)

Para manter custo zero, use:

- GitHub Pages para hospedar o frontend
- `VITE_STATIC_DEMO=true` para respostas locais sem backend pago

Nesse modo, o app continua util para demonstracao de fluxos clinicos, UX e protocolos, mas nao chama OpenAI em producao.

## Modo OpenAI Real (Producao)

Para o frontend publicado no GitHub Pages chamar a API real, configure uma API backend externa (ex.: Firebase Functions) e defina a variavel de repositório:

- `VITE_API_BASE_URL`: URL base da API publicada, por exemplo `https://us-central1-SEU_PROJETO.cloudfunctions.net`

Com isso, o frontend publicado usara `${VITE_API_BASE_URL}/api/chat`.

Workflow pronto:

- `.github/workflows/pages-deploy.yml`

Como usar:

1. Publique o repositório no GitHub e use a branch `main`.
2. Em `Settings > Pages`, selecione `GitHub Actions`.
3. Em `Settings > Secrets and variables > Actions > Variables`, crie `VITE_API_BASE_URL`.
4. Faça push na `main` para publicar automaticamente.

Build local no modo gratuito:

```bash
set VITE_STATIC_DEMO=true
set VITE_BASE_PATH=/NOME_DO_REPO/
npm run build:free
```

Observacao:

- Firebase com Cloud Functions pode exigir plano com billing para uso completo da API externa.
- Para custo zero estrito, priorize GitHub Pages com modo estatico.

## Vertical Saude (MVP)

O app inclui um modo clinico inicial com:

- Selecao de linha de cuidado: `reabilitacao`, `transicao` e `paliativos`
- Selecao de linguagem-alvo: equipe assistencial ou cuidador/familia
- Campo de contexto clinico do paciente para respostas mais situacionais
- Prompts rapidos por linha de cuidado
- Guardrails de seguranca para risco agudo e alerta de escalonamento

Importante:

- Esta aplicacao e um apoio a decisao e comunicacao.
- Nao substitui avaliacao clinica presencial, prescricao medica e protocolos institucionais.
- Em suspeita de emergencia, acionar imediatamente o servico local (ex.: SAMU 192 no Brasil).

## Hospedagem no Firebase

Este projeto esta preparado para:

- Frontend no Firebase Hosting
- API em Firebase Cloud Functions (rota `/api/**`)

Arquivos de deploy:

- `firebase.json`
- `.firebaserc`
- `functions/index.js`
- `.github/workflows/firebase-deploy.yml`

### Deploy Manual

- Instale o Firebase CLI:

```bash
npm install -g firebase-tools
```

- Login e selecione o projeto:

```bash
firebase login
firebase use <SEU_FIREBASE_PROJECT_ID>
```

- Instale dependencias das functions:

```bash
npm run functions:install
```

- Configure variaveis para cloud functions:

1. Copie `functions/.env.example` para `functions/.env`.
2. Preencha `OPENAI_API_KEY` real (ou `DEMO_MODE=true` para testes).

- Faça o deploy:

```bash
npm run firebase:deploy
```

### Deploy Automatico com GitHub Actions

Workflow ja criado em `.github/workflows/firebase-deploy.yml`.

Configure os secrets do repositório:

- `FIREBASE_TOKEN` (gerado com `firebase login:ci`)
- `FIREBASE_PROJECT_ID`
- `OPENAI_API_KEY`

Opcionalmente configure GitHub Variables para ajustar limites e modelo:

- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_MS`
- `MAX_INPUT_CHARS`
- `MAX_MESSAGES`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `DEMO_MODE`
