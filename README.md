# Site Chips in Hand

SPA standalone em Angular 22 para onboarding por Google, convite de clínica,
vínculo com Google Agenda, conexão do WhatsApp por Embedded Signup e
consulta pública de cobrança. O escopo segue
[`SITE_ENDPOINT_COVERAGE.md`](../backend_chips_in_hand/SITE_ENDPOINT_COVERAGE.md).

O site é o consumidor atual do onboarding account-first e da entrada por
convite. Ele autentica/cria a conta Google antes de coletar e criar a primeira
clínica. O Flutter mantém login e abre `/register` no navegador quando esse
onboarding é necessário. As rotas atômicas compatíveis
`POST /api/auth/register` e `POST /api/auth/google/register` continuam no
backend, mas não são chamadas pelo cadastro atual deste site nem pelo Flutter.

## Stack e requisitos

- Angular Core 22.1.5 e Angular CLI/Build 22.1.7;
- TypeScript 6;
- Vitest 4;
- Node `^22.22.3`, `^24.15.0` ou `>=26.0.0`;
- backend local em `http://localhost:8080`.

Não há `.env` com segredos no frontend: o client ID e o client secret Google
ficam somente no perfil versionado do backend. Durante o desenvolvimento,
`/api` é encaminhado automaticamente para `http://127.0.0.1:8080` através de
[`proxy.conf.json`](proxy.conf.json).

## Rotas do site

| Página                                   | Endpoint principal                                        | Acesso                                     |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `/register`                              | `/api/auth/google/account`, `/api/companies` ou convite   | conta primeiro; depois clínica ou convite  |
| `/login`                                 | `/api/auth/login` ou `/api/auth/google/*`                 | público; senha ou Google                   |
| seletor de idioma autenticado            | `PATCH /api/users/preferences`                            | conta, sem tenant                          |
| `/auth/google/complete`                  | página segura de retorno da identidade                    | público; fecha o popup e não recebe tokens |
| `/settings/integrations/google-calendar` | `/api/integrations/google-calendar/*`                     | sessão, tenant, capability e RBAC          |
| `/integrations/google-calendar/complete` | página segura de retorno do OAuth                         | público; não confirma estado por si só     |
| `/settings/integrations/whatsapp`        | `POST /api/integrations/whatsapp/authorize` e `/complete` | sessão, tenant, capability e RBAC          |
| `/whatsapp`                              | redirecionamento interno para a página acima              | sessão                                     |
| `/pay/:token`                            | `GET /api/public/billing-links/{token}`                   | público por token temporário               |

A gestão WhatsApp mostra separadamente as versões controladas pela Chips e o
catálogo somente leitura sincronizado da WABA. Templates criados fora da Chips
usam IDs locais na resposta e nunca são ativados automaticamente em agenda ou
cobrança; a tela não persiste esse catálogo em cache offline.

Conta Chips e identidade Google são globais; associação, papel, perfil
profissional e conexão Calendar pertencem à clínica. Por isso,
`companies[].isProfessional` (a projeção `session.isProfessional` da clínica
selecionada) significa perfil profissional ativo naquele tenant, não um tipo
global de usuário.

| Entrada em `/register`             | Resultado                                              | Calendar                          |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------- |
| Google + “conectar Agenda agora”  | cria ou autentica somente a conta global               | grant cifrado; conexão aguarda a clínica |
| Google + “conectar depois”        | cria ou autentica somente a conta global               | não solicitado                    |
| Conta existente com clínica        | entra na clínica; não cria duplicata                    | não solicitado                    |
| Conta existente sem clínica        | continua o wizard para cadastrar a primeira            | mantém a escolha “agora/depois”   |
| Criar como `admin`                 | clínica e vínculo administrativo, sem perfil            | não solicitado                    |
| Criar como `adminProfessional`     | clínica, vínculo e perfil profissional                  | cria conexão se autorizada; senão fica disponível depois |
| Convite administrativo             | associação na clínica existente, sem perfil             | não solicitado                    |
| Convite profissional               | associação e perfil mínimo automático                   | pode usar o mesmo consentimento   |

O site envia `intent: login|register|join`; `ownerMode` existe apenas em
`register` e `inviteCode` apenas em `join`. No cadastro profissional, a etapa 1
oferece explicitamente conectar o Agenda agora ou depois e envia
`requestCalendar:true|false` conforme essa escolha; convite profissional também
pode solicitar Calendar. `calendarAccess` pode ser
`notRequested`, `granted`, `declined` ou `unavailable`. Se somente Calendar
estiver indisponível, a identidade continua; indisponibilidade da identidade
retorna `google_auth_unavailable`. Contextos inválidos e vínculo explícito são
tratados por `invalid_google_auth_intent`, `invalid_google_auth_context` e
`identity_link_required`.

O backend reconhece identidade Google por `issuer + sub`. Coincidência apenas
de e-mail nunca vincula contas automaticamente e pode retornar
`identity_link_required`. Nesse caso, ainda na etapa 1, o usuário confirma a
senha da conta existente e o backend revalida as duas provas. Se ela já tiver
clínica, o site entra sem criar outra; se ainda não tiver, o mesmo wizard
continua para cadastrar a primeira.

Uma sessão autenticada com `companies: []` é válida e fica no
`sessionStorage`. Guardas de páginas tenant a devolvem a
`/register?clinic=required`. Na etapa final, o site chama somente
`POST /api/companies` com bearer e uma chave idempotente estável. Quando a
opção “agora” foi concedida, o payload inclui somente a autorização opaca
`googleCalendarAuthorization`; o backend cria perfil, conexão e outbox na mesma
transação sem expor token Google. Depois o site relê
`GET /api/auth/session` e então libera as páginas da clínica.

## Execução local

Instale e inicie o site:

```sh
npm install
npm start
```

Abra `https://localhost:3000`. O servidor usa HTTPS local porque o Embedded Signup da Meta deve ser testado em contexto seguro. O certificado é de desenvolvimento e pode exigir confirmação no navegador.

Em outro terminal, prepare o backend conforme [`LOCAL_DEVELOPMENT.md`](../backend_chips_in_hand/LOCAL_DEVELOPMENT.md):

```sh
cd ../backend_chips_in_hand # se os repositórios estiverem lado a lado
./scripts/run-google-dev.sh
```

No primeiro `up`, o namespace `google-dev` começa com bancos vazios. Repetir o
comando preserva os dados. Para zerar bancos e anexos apenas desse ambiente:

```sh
./scripts/dev fresh --yes --environment google-dev
```

O proxy evita configuração de CORS no navegador, e o perfil Google padrão do
backend já permite exatamente a URL de retorno do site em
`https://localhost:3000/integrations/google-calendar/complete`.

Configure também a URL fixa do WhatsApp, sem query ou fragmento:

```dotenv
WHATSAPP_MANAGEMENT_URL=https://localhost:3000/settings/integrations/whatsapp
```

Login e a etapa 1 do cadastro solicitam apenas identidade. Depois que uma
clínica `adminProfessional` existe, o usuário pode vincular o escopo mínimo de
Calendar na área autenticada. Convite profissional ainda pode combinar os
consentimentos e cria o perfil no backend sem formulário adicional. Nenhum
secret ou token Google é entregue ao Angular.

Para testar o Embedded Signup, prepare `.env.meta.local` e
`.secrets/meta-token-keyring.json` como documentado pelo backend e suba o mesmo
namespace com Meta habilitada:

```sh
./scripts/dev up --environment google-dev --meta
```

A capability `whatsappMessaging` e as permissões continuam sendo autoridade do backend; o site apenas reflete o estado retornado pela sessão.

O backend também publica `GET /api/integrations/whatsapp/preflight` para
diagnóstico administrativo. Ainda não há tela dedicada no site. Uma futura
integração deve respeitar `Cache-Control: no-store`, não gravar o resultado em
storage e manter App Live, Advanced Access e Tech Provider como
`manual_required`, mesmo quando `automaticReady` for verdadeiro.

Na administração da conexão, o site exibe as oito etapas persistidas e
sanitizadas retornadas por `link-status`. O decoder exige ordem, estados,
timestamps e códigos estáveis; a tela localiza esses valores e nunca renderiza
respostas ou erros brutos da Meta. O diagnóstico não é salvo no navegador.

## Idiomas

Toda a interface do site usa o catálogo tipado de `src/app/core/i18n.service.ts`
e oferece PT-BR (`pt-BR`), inglês (`en`) e espanhol neutro (`es`) no seletor do
cabeçalho. Títulos de rota, metadados, mensagens dos fluxos Google/Meta, datas e
moedas reagem ao locale ativo. Locale ausente ou desconhecido cai para PT-BR;
durante o cadastro, a escolha inicial é enviada como `preferredLocale` da conta
e `defaultLocale` da clínica. Depois da autenticação, a sessão canônica define
o idioma e novas escolhas usam `PATCH /api/users/preferences`, com
idempotência e sem `X-Tenant-Id`; uma falha preserva o último valor confirmado.

Erros e warnings canônicos são renderizados por `messageKey` e
`messageParams`; códigos futuros recebem uma mensagem genérica no idioma ativo
sem perder o fallback PT-BR do backend. A lógica continua baseada em `code`,
nunca no texto. Novos textos locais devem entrar no catálogo e manter paridade
entre os três idiomas.

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
<meta
  name="chips-google-calendar-return-url"
  content="https://app.exemplo.com/integrations/google-calendar/complete"
/>
```

Nesse caso, adicione a origem exata do site a `CORS_ALLOWED_ORIGINS`. A configuração rejeita HTTP fora de loopback, URL com credenciais, path, query ou fragmento.

## Decisões de segurança

- o JWT fica somente no `sessionStorage` da aba; o refresh token retornado no cadastro/login não é persistido pelo site;
- `attemptId` e `exchangeToken` do login Google ficam somente em memória; state,
  code e tokens do provedor nunca chegam ao JavaScript do site;
- login Google e criação da conta na etapa 1 nunca concedem acesso ao
  calendário; convite profissional pode combinar identidade e Agenda, e o
  vínculo posterior permanece separado;
- `sessionToken` e code da Meta existem apenas em variáveis transitórias do fluxo e nunca entram em URL ou storage;
- `authorize` e `complete` usam o mesmo usuário, associação e tenant capturados no início; qualquer troca interrompe a conclusão;
- os dois comandos enviam `Idempotency-Key`, `X-Operation-Id` e `X-Client-Occurred-At`;
- o site não troca o code com a Meta e só confirma conexão após a resposta canônica do backend;
- erro de link de cobrança é sempre apresentado de forma genérica;
- não há analytics, logs de payload ou carregamento de fontes externas;
- deep links públicos só são renderizados quando usam o protocolo `chipsinhand:`.

Os testes cobrem conta nova, conta existente com clínica, conta existente sem
clínica, vínculo legado por senha, criação única e idempotente da primeira
clínica, falhas canônicas, headers autenticados, capability e permissão
ausentes, troca de tenant durante popup, validação Meta e ausência de segredos.
