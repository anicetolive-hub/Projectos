# Instalar no servidor (Ubuntu)

Guia para pôr a aplicação **Tarefas e Projectos** a funcionar num servidor
Ubuntu 22.04 ou 24.04. Um único script instala e configura tudo; o mesmo
script serve depois para atualizar.

## O que é preciso

- Servidor Ubuntu 22.04 ou 24.04 com acesso de administrador (`sudo`) e
  ligação à internet. Chega 1 vCPU, 2 GB de RAM e 10 GB de disco.
- Portas 80 (e 443, se usar domínio) acessíveis a quem vai usar a aplicação.
- Opcional, para HTTPS: um domínio (ex: `tarefas.empresa.ao`) cujo registo DNS
  aponte para o IP do servidor, e um email para o aviso de renovação do
  certificado. Sem domínio, acede-se por `http://IP-do-servidor` (só na rede
  interna, porque sem HTTPS as passwords circulam sem cifra).
- Opcional, para o assistente de chat: uma chave da API Anthropic, criada em
  https://console.anthropic.com (serviço pago à parte, cobrado por uso).

## Instalação

1. Copiar o projeto para o servidor. O repositório é privado, por isso é
   preciso autenticação no GitHub; a forma mais simples é a ferramenta `gh`:

   ```bash
   sudo apt install -y gh git
   gh auth login                      # seguir as instruções no ecrã
   gh repo clone anicetolive-hub/projectos ~/projectos
   cd ~/projectos
   ```

2. Correr o script (escolha uma das linhas):

   ```bash
   # Acesso pelo IP, na rede interna
   sudo ./deploy/instalar.sh

   # Com domínio e HTTPS
   sudo ./deploy/instalar.sh --dominio tarefas.empresa.ao --email ti@empresa.ao

   # Qualquer uma das anteriores, já com o assistente de chat ativo
   sudo ./deploy/instalar.sh --dominio tarefas.empresa.ao --email ti@empresa.ao --chave-anthropic sk-ant-...
   ```

   Demora 3 a 10 minutos. No fim mostra o endereço da aplicação.

3. Abrir o endereço no navegador. No **primeiro acesso** a aplicação pede
   para criar a conta de administrador (nome, email, password). Depois, em
   **Equipa**, cria-se a estrutura (direção e áreas) e dá-se acesso às
   pessoas.

## O que o script faz

| Onde | O quê |
| --- | --- |
| `/opt/tarefas-projectos` | Código da aplicação |
| `/var/lib/tarefas-projectos/app.db` | Base de dados (SQLite) |
| `/etc/tarefas-projectos/.env` | Configuração (alertas, Teams, assistente) |
| `/var/www/tarefas-projectos` | Painel web, servido pelo Nginx |
| `/var/backups/tarefas-projectos` | Cópia diária da base de dados (últimos 14 dias) e cópia antes de cada atualização |
| Serviço `tarefas-projectos` | A API, que arranca com o servidor e reinicia sozinha se falhar |

Instala Node.js 22, Nginx e SQLite, cria o utilizador de sistema `tarefas`
(a API não corre como root) e, com `--dominio`, obtém um certificado HTTPS
gratuito da Let's Encrypt que se renova sozinho.

## Depois de instalado

- **Ativar o assistente de chat** mais tarde: pôr a chave em
  `ANTHROPIC_API_KEY` no ficheiro `/etc/tarefas-projectos/.env` e correr
  `sudo systemctl restart tarefas-projectos`.
- **Alertas no Microsoft Teams**: no canal, criar um *Incoming Webhook*, pôr o
  endereço em `ALERT_WEBHOOK_URL` no mesmo ficheiro e reiniciar o serviço.
- **Ver o que se passa**: `journalctl -u tarefas-projectos -f`.
- **Atualizar** para uma versão nova:

  ```bash
  cd ~/projectos && git pull
  sudo ./deploy/instalar.sh            # com as mesmas opções da instalação
  ```

  A configuração e os dados mantêm-se; antes de alterar a base de dados é
  feita uma cópia em `/var/backups/tarefas-projectos`.

- **Repor uma cópia de segurança**:

  ```bash
  sudo systemctl stop tarefas-projectos
  sudo cp /var/backups/tarefas-projectos/app-AAAAMMDD.db /var/lib/tarefas-projectos/app.db
  sudo chown tarefas:tarefas /var/lib/tarefas-projectos/app.db
  sudo systemctl start tarefas-projectos
  ```

## Problemas comuns

- **O certificado HTTPS falhou**: confirme que o domínio aponta para o IP do
  servidor (`ping tarefas.empresa.ao`) e que a porta 80 está aberta à
  internet; depois corra o script de novo com as mesmas opções.
- **A página abre mas não entra**: veja `journalctl -u tarefas-projectos -n 50`.
- **O assistente diz que não está ativo**: falta `ANTHROPIC_API_KEY` no
  `.env`, ou o serviço não foi reiniciado depois de a pôr.

## Alternativa: deixar o Claude fazer a instalação

Em vez de correr os comandos à mão, pode instalar o Claude Code no próprio
servidor e pedir-lhe a instalação, acompanhando a partir da app Claude no
telemóvel:

1. No servidor: instalar o Claude Code (instruções em
   https://code.claude.com/docs) e copiar o projeto como no passo 1 acima.
2. Na pasta do projeto, correr `claude remote-control` e entrar com a conta
   Claude. A sessão passa a aparecer na app Claude (secção Code).
3. Na app, pedir: "Instala esta aplicação seguindo deploy/INSTALAR.md". O
   Claude pede autorização antes de cada comando.
