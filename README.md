# Site Chips in Hand

SPA standalone em Angular 22 para as experiências que não pertencem ao aplicativo Flutter. O escopo segue [`SITE_ENDPOINT_COVERAGE.md`](../backend_chips_in_hand/SITE_ENDPOINT_COVERAGE.md): cadastro público, conexão do WhatsApp por Embedded Signup e consulta pública de cobrança.

## Stack e requisitos

- Angular Core 22.1.5 e Angular CLI/Build 22.1.7;
- TypeScript 6;
- Vitest 4;
- Node `^22.22.3`, `^24.15.0` ou `>=26.0.0`;
- backend local em `http://localhost:8080`.

Não há `.env` com segredos no frontend. Durante o desenvolvimento, `/api` é encaminhado pelo Angular para o backend através de [`proxy.conf.json`](proxy.conf.json).

## Rotas do site

| Página                            | Endpoint principal                                        | Acesso                                             |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `/register`                       | `POST /api/auth/register`                                 | público                                            |
| `/login`                          | `POST /api/auth/login`                                    | público; suporte à página fixa aberta pelo Flutter |
| `/settings/integrations/whatsapp` | `POST /api/integrations/whatsapp/authorize` e `/complete` | sessão, tenant, capability e RBAC                  |
| `/whatsapp`                       | redirecionamento interno para a página acima              | sessão                                             |
| `/pay/:token`                     | `GET /api/public/billing-links/{token}`                   | público por token temporário                       |

## Execução local

Instale e inicie o site:

```sh
cd /rafael/projects/site_chips_in_hand
npm install
npm start
```

Abra `https://localhost:3000`. O servidor usa HTTPS local porque o Embedded Signup da Meta deve ser testado em contexto seguro. O certificado é de desenvolvimento e pode exigir confirmação no navegador.

Em outro terminal, prepare o backend conforme [`LOCAL_DEVELOPMENT.md`](../backend_chips_in_hand/LOCAL_DEVELOPMENT.md):

```sh
cd /rafael/projects/backend_chips_in_hand
./scripts/dev init
./scripts/dev up --environment site-test
```

No primeiro `up`, o namespace `site-test` começa com bancos vazios. Repetir o comando preserva os dados. Para zerar bancos e anexos apenas desse ambiente e já subir novamente:

```sh
./scripts/dev fresh --yes --environment site-test
```

Para o navegador acessar a API, inclua exatamente `https://localhost:3000` em `CORS_ALLOWED_ORIGINS` no `.env.local`. Configure também a URL fixa, sem query ou fragmento:

```dotenv
WHATSAPP_MANAGEMENT_URL=https://localhost:3000/settings/integrations/whatsapp
```

O cadastro e a página de cobrança funcionam sem provedores externos. Para testar o Embedded Signup, prepare `.env.meta.local` e `.secrets/meta-token-keyring.json` como documentado pelo backend e suba o mesmo namespace com Meta habilitada:

```sh
./scripts/dev up --environment site-test --meta
```

A capability `whatsappMessaging` e as permissões continuam sendo autoridade do backend; o site apenas reflete o estado retornado pela sessão.

## Comandos

```sh
npm start       # HTTPS em https://localhost:3000, com proxy /api
npm test        # suíte Vitest sem modo watch
npm run check   # compilação Angular de desenvolvimento
npm run build   # build otimizado de produção
```

O build é gerado em `dist/site-chips-in-hand/browser`.

## Configuração em produção

O modo recomendado é servir o conteúdo estático e encaminhar `/api` para o backend na mesma origem. O servidor web precisa aplicar fallback de SPA para `index.html`, exceto em `/api`.

Se o backend estiver em outra origem, defina apenas a origem pública — nunca credenciais — no HTML antes do deploy:

```html
<meta name="chips-api-base-url" content="https://api.exemplo.com" />
```

Nesse caso, adicione a origem exata do site a `CORS_ALLOWED_ORIGINS`. A configuração rejeita HTTP fora de loopback, URL com credenciais, path, query ou fragmento.

## Decisões de segurança

- o JWT fica somente no `sessionStorage` da aba; o refresh token retornado no cadastro/login não é persistido pelo site;
- `sessionToken` e code da Meta existem apenas em variáveis transitórias do fluxo e nunca entram em URL ou storage;
- `authorize` e `complete` usam o mesmo usuário, associação e tenant capturados no início; qualquer troca interrompe a conclusão;
- os dois comandos enviam `Idempotency-Key`, `X-Operation-Id` e `X-Client-Occurred-At`;
- o site não troca o code com a Meta e só confirma conexão após a resposta canônica do backend;
- erro de link de cobrança é sempre apresentado de forma genérica;
- não há analytics, logs de payload ou carregamento de fontes externas;
- deep links públicos só são renderizados quando usam o protocolo `chipsinhand:`.

Os testes cobrem sucesso e falhas canônicas de cadastro, resultado de transporte incerto sem reenvio, headers autenticados, capability e permissão ausentes, troca de tenant durante o popup, validação de origem Meta, token público inválido e ausência de segredos em URL, storage e console.
