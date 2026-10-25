# Tarefas e Projectos

Ferramenta da Direção de Sistemas de Informação para medir a performance dos
**departamentos**, dos **gestores e coordenadores** e da **própria direção**
(KPIs e objetivos estratégicos, de direção e individuais) e gerir **projetos e
tarefas** com alertas de prazo.

## Estrutura do projeto

```
backend/   API REST em Node.js + TypeScript + Express + Prisma (SQLite)
frontend/  Painel web em React + Vite + TypeScript
```

## Instalar num servidor

Para pôr a aplicação a funcionar num servidor Ubuntu, com HTTPS e cópias de
segurança, basta um comando: ver [deploy/INSTALAR.md](deploy/INSTALAR.md).

## Como correr (desenvolvimento)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # ajuste as opções de alertas e sessão, se quiser
npm run prisma:migrate    # cria a base de dados SQLite local (dev.db)
npm run seed:performance  # opcional: dados de exemplo
npm run dev               # inicia a API em http://localhost:3333
```

Com os dados de exemplo, entre com `diretor.si@exemplo.ao` / `Mudar@2026`
(administrador); as outras pessoas de exemplo usam a mesma password. Sem dados
de exemplo, o primeiro acesso pede para criar o administrador.

Testes: `npm test` (motor de cálculo de performance/alertas, passwords e
regras de acesso). Build de produção: `npm run build && npm start`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # aponta VITE_API_URL para a API
npm run dev                 # abre em http://localhost:5173
```

## Assistente de chat

Em todas as páginas há um botão **Assistente** que abre um chat. Escreve-se em
linguagem natural para consultar ou registar informação sem ir aos menus, por
exemplo:

- "Que tarefas minhas estão atrasadas?"
- "Como está a performance dos coordenadores?"
- "Cria um objetivo individual para o Coordenador de Redes: documentar as VPNs até 30 de novembro"
- "Regista 92% no KPI de tickets dentro do SLA de outubro"
- "Marca a tarefa da reunião com o CEO como concluída"
- "Regista a solução do portal de self-service: 35% menos chamadas ao Service Desk"
- "Que ideias estão em avaliação?"

O assistente usa o Claude (API da Anthropic) com ferramentas que chamam a
própria API da aplicação **com a sessão de quem está a escrever**: vê e altera
só o que essa pessoa veria e alteraria pelos menus, com as mesmas validações.
Não remove nada; para apagar usam-se os menus. Cada alteração feita aparece no
chat (✔ ou ✕) e as páginas abertas atualizam-se sozinhas.

Configuração (`backend/.env`):

- `ANTHROPIC_API_KEY`: chave criada em https://console.anthropic.com. Sem ela o
  chat fica desativado e o resto da aplicação funciona normalmente.
- `ASSISTANT_MODEL` (padrão `claude-opus-5-5`) e `ASSISTANT_TIME_ZONE`
  (padrão `Africa/Luanda`, para interpretar "hoje", "sexta", "fim do mês").

Privacidade: as mensagens e os dados que o assistente consulta para responder
são enviados à API da Anthropic. Cada conversa fica guardada na memória do
servidor durante 2 horas e perde-se ao reiniciar a API.

Código: `backend/src/services/assistant/` (`tools.ts` define as ferramentas,
`executor.ts` executa-as, `assistant.ts` gere a conversa, `prompt.ts` tem as
instruções) e `frontend/src/assistant/`.

## Versão de demonstração (sem servidor)

`cd frontend && npm run build:demo` gera `frontend/dist-demo/demo.html`: uma
página única com a aplicação e os dados de exemplo, que corre
inteira no navegador (também no telemóvel). Não precisa de backend nem de base
de dados: as chamadas à API são respondidas no próprio navegador
(`frontend/src/demo/mockApi.ts`), com o mesmo motor de cálculo e as mesmas
regras de acesso do backend, e as alterações ficam guardadas só nesse
aparelho. O assistente de chat, na demonstração, funciona só com a página
aberta no claude.ai: usa o Claude da conta de quem a está a ver
(`frontend/src/demo/mockAssistant.ts`). Na entrada escolhe-se com que perfil entrar (diretor, gestor,
coordenador ou colaborador). Serve para avaliar a ferramenta; não é para uso
real.

## Login e permissões

A aplicação exige login (email + password). No **primeiro acesso**,
sem nenhum administrador criado, o ecrã de login pede para criar a conta de
administrador. Depois disso, o administrador dá acesso às restantes pessoas em
**Equipa** (email + password inicial, ou "Dar acesso" /
"Redefinir password") e cada um troca a sua password no menu com o seu nome,
no canto superior direito.

- Passwords guardadas com hash `scrypt` (nunca em texto); mínimo de 8 caracteres.
- Sessões com token aleatório guardado apenas como hash; duram
  `SESSION_TTL_HOURS` (padrão 12 h) e terminam ao sair, ao trocar a password
  ou quando o administrador desativa a pessoa.
- Após 5 tentativas falhadas, o email fica bloqueado 15 minutos.

| Perfil | Vê | Pode alterar |
| --- | --- | --- |
| **Administrador** | Tudo | Tudo: estrutura, pessoas e acessos, KPIs, objetivos estratégicos |
| **Diretor / Gestor / Coordenador** | O seu departamento e as áreas abaixo dele, mais os objetivos estratégicos | Tarefas e objetivos individuais da sua equipa, objetivos de direção do seu departamento, valores dos KPIs da equipa, projetos que gere |
| **Colaborador** | O que é seu, mais os objetivos estratégicos | As suas tarefas, os seus objetivos individuais e os valores dos KPIs de que é responsável |

## Funcionalidades

| Página | Para que serve |
| --- | --- |
| **Visão geral** | A minha nota, objetivos estratégicos, nota consolidada da direção, ranking dos departamentos e dos gestores/coordenadores, e os alertas prioritários. |
| **Objetivos** | Objetivos em cascata: **estratégicos** (organização) → **de direção** (departamento) → **individuais** (pessoa), com progresso, ritmo e situação de prazo. |
| **KPIs** | Cadastro de KPIs por departamento e responsável (meta, sentido, frequência, peso) e registo dos valores de cada período, com histórico e tendência. |
| **Projetos e tarefas** | Projetos com progresso e situação de prazo; tarefas com responsável, prazo e progresso. Filtros "As minhas", "Abertas" e "Atrasadas / em risco". |
| **Feitos** | Mural dos grandes feitos da direção: soluções desenvolvidas, ideias inovadoras (proposta → em avaliação → aprovada → implementada, ou posta de parte), melhorias de processo e reconhecimentos, com autores, impacto e ligação a projetos/objetivos. Todos veem e todos podem propor; os destaques aparecem na visão geral. |
| **Equipa** | Estrutura de departamentos (a direção no topo e as áreas por baixo) e pessoas com o seu nível: diretor, gestor, coordenador ou colaborador. |
| **Alertas** | Todos os alertas ativos, com filtro por severidade e "só os meus". |

No topo de todas as páginas, o sino mostra os alertas críticos / de atenção
visíveis para quem tem a sessão iniciada.

### Objetivos

Cada objetivo de direção contribui para um estratégico e cada individual para
um de direção. KPIs e projetos podem ser ligados a um objetivo (nos
formulários de KPIs e de projetos). O **progresso** de um objetivo é a média
ponderada do que está ligado a ele: atingimento dos KPIs (máx. 100%),
progresso dos projetos e progresso dos objetivos filhos (pelo peso de cada
um). Sem nada ligado, o responsável atualiza o progresso à mão. O **ritmo**
compara o progresso com o tempo já decorrido (ex.: 30% feito com 60% do
prazo consumido = ritmo 50) e só é avaliado depois de passados 10% do prazo.

### Como as notas são calculadas

- **Atingimento de um KPI** = valor ÷ meta (ou meta ÷ valor quando "menor é
  melhor"), limitado a 120%. Verde a partir de 100%, amarelo entre o
  *limiar crítico* do KPI e 100%, vermelho abaixo do limiar.
- **Nota de KPIs** de uma pessoa ou departamento = média do atingimento dos
  seus KPIs, ponderada pelo peso de cada um (usa a medição mais recente).
- **Nota de entrega** = tarefas com prazo nos últimos 90 dias: no prazo
  vale 100, entregue com atraso 50, em atraso (aberta e vencida) 0.
- **Nota de objetivos** = média do ritmo dos objetivos de que a pessoa é
  responsável, ponderada pelo peso.
- **Nota final** = 50% KPIs + 20% objetivos + 30% entrega (se faltar um
  componente, os restantes são reponderados). Verde ≥ 90, amarelo ≥ 70,
  vermelho abaixo de 70.
- **Departamento**: nota própria = KPIs e objetivos de direção do
  departamento + entrega das tarefas da sua equipa; **nota consolidada** = média da nota própria com a
  consolidada de cada área subordinada. A nota consolidada do departamento
  de topo é a nota da direção.

Os pesos e faixas estão em `backend/src/services/performance/engine.ts`.

### Alertas de prazos e KPIs

Recalculados a cada consulta:

| Alerta | Severidade |
| --- | --- |
| Tarefa, projeto ou objetivo com prazo ultrapassado | Crítico |
| KPI abaixo do limiar crítico | Crítico |
| Prazo termina em `ALERT_DUE_SOON_DAYS` dias ou menos (padrão 3) | Atenção |
| Em risco: bloqueado/em espera, ou mais de metade do prazo consumido com o progresso 25 pontos atrás do tempo | Atenção |
| KPI abaixo da meta, mas acima do limiar | Atenção |
| KPI sem o valor do último período encerrado | Info |

Formas de receber os alertas:

1. **No painel**: sino no topo e página **Alertas** (atualiza a cada 5 min).
2. **Notificação do navegador**: em **Alertas → Ativar notificações no
   navegador**. Com o painel aberto, cada alerta crítico novo gera uma
   notificação.
3. **Microsoft Teams ou Slack**: crie um *Incoming Webhook* no canal e
   preencha `ALERT_WEBHOOK_URL` no `backend/.env`. A API verifica a cada
   `ALERT_CHECK_INTERVAL_MINUTES` (padrão 60) e envia apenas os alertas
   novos a partir de `ALERT_WEBHOOK_MIN_SEVERITY` (padrão `WARNING`). Cada
   alerta é enviado uma única vez (registo na tabela `AlertNotification`).
   Para forçar uma verificação, use o botão **Enviar novos para Teams/Slack**
   ou `POST /api/performance/alerts/notify`.

### API

Login em `/api/auth` (`status`, `setup`, `login`, `logout`, `me`,
`change-password`); as restantes rotas exigem o cabeçalho
`Authorization: Bearer <token>`. As do módulo ficam em `/api/performance`:
`dashboard`, `alerts`, `departments`, `people`, `objectives`, `kpis` (+ `POST /kpis/:id/measurements` com
`{ period, value }`; períodos `2026-10`, `2026-Q4`, `2026-W43` ou `2026`),
`projects` e `tasks` (CRUD com GET/POST/PUT/DELETE). Ao mudar uma tarefa
para concluída, a data de conclusão é registada automaticamente; é essa data
que define se foi entregue no prazo.
