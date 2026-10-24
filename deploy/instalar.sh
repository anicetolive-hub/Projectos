#!/usr/bin/env bash
# Instala (ou atualiza) a aplicação Tarefas e Projectos num servidor Ubuntu
# 22.04 ou 24.04: Node.js, API como serviço, painel web servido pelo Nginx e,
# opcionalmente, certificado HTTPS gratuito (Let's Encrypt).
#
# Uso, dentro da pasta do projeto:
#   sudo ./deploy/instalar.sh                                   # acesso pelo IP
#   sudo ./deploy/instalar.sh --dominio tarefas.empresa.ao --email ti@empresa.ao
#   sudo ./deploy/instalar.sh --chave-anthropic sk-ant-...     # ativa o assistente
#
# Para atualizar: `git pull` na pasta do projeto e correr o mesmo comando.
# Os dados (base de dados e configuração) ficam fora da pasta da aplicação e
# não se perdem nas atualizações.
set -euo pipefail

APP=tarefas-projectos
APP_DIR=/opt/$APP                 # código da aplicação
DATA_DIR=/var/lib/$APP            # base de dados
CONF_DIR=/etc/$APP                # configuração (.env)
WEB_DIR=/var/www/$APP             # painel web já compilado
BACKUP_DIR=/var/backups/$APP      # cópias diárias da base de dados
APP_USER=tarefas
PORT=3333
NODE_MAJOR=22

DOMINIO=""
EMAIL=""
CHAVE_ANTHROPIC=""

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dominio) DOMINIO="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --chave-anthropic) CHAVE_ANTHROPIC="${2:-}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Opção desconhecida: $1" >&2; usage 1 ;;
  esac
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAviso:\033[0m %s\n' "$*"; }
erro() { printf '\033[1;31mErro:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || erro "corra com sudo: sudo $0 $*"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$SRC_DIR/backend/package.json" && -f "$SRC_DIR/frontend/package.json" ]] ||
  erro "não encontrei backend/ e frontend/ em $SRC_DIR; corra o script a partir da pasta do projeto."
[[ -z "$DOMINIO" || -n "$EMAIL" ]] || erro "com --dominio indique também --email (para o certificado HTTPS)."

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || aviso "sistema ${PRETTY_NAME:-desconhecido}; o script foi feito para Ubuntu 22.04/24.04."
fi

# ---------------------------------------------------------------------------
passo "Pacotes do sistema (Nginx, Node.js $NODE_MAJOR, SQLite)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg nginx sqlite3 rsync openssl >/dev/null

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node.js $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
passo "Utilizador e pastas"
id "$APP_USER" &>/dev/null || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$DATA_DIR"
install -d -m 0750 "$CONF_DIR" "$BACKUP_DIR"
install -d -m 0755 "$APP_DIR" "$WEB_DIR"

rsync -a --delete \
  --exclude node_modules --exclude dist --exclude dist-demo --exclude .git \
  --exclude '*.db' --exclude '*.db-journal' --exclude .env \
  "$SRC_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------------
passo "Configuração ($CONF_DIR/.env)"
if [[ -n "$DOMINIO" ]]; then
  URL="https://$DOMINIO"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  URL="http://${IP:-localhost}"
fi

ENV_FILE="$CONF_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# Configuração da API Tarefas e Projectos (gerada por deploy/instalar.sh).
# Depois de alterar: sudo systemctl restart $APP
DATABASE_URL="file:$DATA_DIR/app.db"
PORT=$PORT
CORS_ORIGIN="$URL"
SESSION_TTL_HOURS=12

# Alertas de prazos e KPIs
ALERT_DUE_SOON_DAYS=3
ALERT_CHECK_INTERVAL_MINUTES=60
# URL de Incoming Webhook do Microsoft Teams (ou Slack) para receber alertas
ALERT_WEBHOOK_URL=""
ALERT_WEBHOOK_MIN_SEVERITY="WARNING"

# Assistente de chat (vazio = desativado)
ANTHROPIC_API_KEY="$CHAVE_ANTHROPIC"
ASSISTANT_MODEL="claude-opus-5-5"
ASSISTANT_TIME_ZONE="Africa/Luanda"
EOF
  echo "Criado $ENV_FILE"
else
  # Atualização: mantém a configuração; só aplica o que foi pedido nesta execução
  sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=\"$URL\"|" "$ENV_FILE"
  if [[ -n "$CHAVE_ANTHROPIC" ]]; then
    if grep -q '^ANTHROPIC_API_KEY=' "$ENV_FILE"; then
      sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"$CHAVE_ANTHROPIC\"|" "$ENV_FILE"
    else
      echo "ANTHROPIC_API_KEY=\"$CHAVE_ANTHROPIC\"" >> "$ENV_FILE"
    fi
  fi
  echo "Mantida a configuração existente em $ENV_FILE"
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
ln -sf "$ENV_FILE" "$APP_DIR/backend/.env"

# ---------------------------------------------------------------------------
as_app() { runuser -u "$APP_USER" -- env HOME="$DATA_DIR" npm_config_cache="$DATA_DIR/.npm" "$@"; }

passo "API: dependências, base de dados e compilação"
cd "$APP_DIR/backend"
as_app npm ci --no-audit --no-fund --loglevel=error
as_app npx prisma generate >/dev/null
# Cópia de segurança antes de aplicar alterações à estrutura da base de dados
if [[ -f "$DATA_DIR/app.db" ]]; then
  sqlite3 "$DATA_DIR/app.db" ".backup '$BACKUP_DIR/antes-de-atualizar-$(date +%Y%m%d-%H%M%S).db'"
fi
as_app env DATABASE_URL="file:$DATA_DIR/app.db" npx prisma migrate deploy
as_app npm run build --silent

passo "Painel web: compilação"
cd "$APP_DIR/frontend"
as_app npm ci --no-audit --no-fund --loglevel=error
# API no mesmo endereço do painel (o Nginx encaminha /api para o serviço)
as_app env VITE_API_URL="" npx vite build --logLevel error
rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_DIR/"

# ---------------------------------------------------------------------------
passo "Serviço da API"
cat > /etc/systemd/system/$APP.service <<EOF
[Unit]
Description=Tarefas e Projectos (API)
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/env node dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

if [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable --quiet $APP
  systemctl restart $APP
else
  # Sem systemd (ex: contentor de testes): arranca em segundo plano
  aviso "systemd não está ativo; a API arranca em segundo plano mas não reinicia sozinha."
  pkill -u "$APP_USER" -f "node dist/index.js" || true
  (
    cd "$APP_DIR/backend"
    set -a && . "$ENV_FILE" && set +a
    exec runuser -u "$APP_USER" -- node dist/index.js
  ) > "$DATA_DIR/api.log" 2>&1 < /dev/null &
  disown
fi

for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || erro "a API não arrancou. Veja: journalctl -u $APP -n 50"
echo "API a responder em 127.0.0.1:$PORT"

# ---------------------------------------------------------------------------
passo "Nginx"
# Só escuta em IPv6 se o servidor o tiver ativo (senão o Nginx não arranca)
LISTEN_V6=""
[[ -f /proc/net/if_inet6 ]] && LISTEN_V6="listen [::]:80;"
cat > /etc/nginx/sites-available/$APP <<EOF
server {
    listen 80;
    $LISTEN_V6
    server_name ${DOMINIO:-_};

    root $WEB_DIR;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # O assistente de chat pode demorar a responder
        proxy_read_timeout 300s;
        client_max_body_size 1m;
    }

    location = /health {
        proxy_pass http://127.0.0.1:$PORT;
    }

    # Ficheiros com nome versionado podem ficar em cache muito tempo
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Navegação do painel (as rotas são tratadas no navegador)
    location / {
        try_files \$uri /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
ln -sf /etc/nginx/sites-available/$APP /etc/nginx/sites-enabled/$APP
# O site de exemplo do Nginx não é preciso (e falha em servidores sem IPv6)
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
if [[ -d /run/systemd/system ]]; then
  systemctl enable --quiet nginx
  systemctl reload nginx || systemctl restart nginx
else
  nginx -s reload 2>/dev/null || nginx > /dev/null 2>&1 < /dev/null
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null
  echo "Firewall: portas 80 e 443 abertas"
fi

# ---------------------------------------------------------------------------
if [[ -n "$DOMINIO" ]]; then
  passo "Certificado HTTPS para $DOMINIO"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  if certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
    echo "HTTPS ativo; o certificado renova-se sozinho."
  else
    aviso "não foi possível obter o certificado. Confirme que o domínio aponta para este servidor e que a porta 80 está acessível da internet; depois corra de novo."
    URL="http://$DOMINIO"
  fi
fi

# ---------------------------------------------------------------------------
passo "Cópias de segurança diárias da base de dados"
cat > /etc/cron.daily/$APP-backup <<EOF
#!/bin/sh
# Cópia diária da base de dados; mantém as últimas 14
[ -f $DATA_DIR/app.db ] || exit 0
sqlite3 $DATA_DIR/app.db ".backup '$BACKUP_DIR/app-\$(date +%Y%m%d).db'"
ls -1t $BACKUP_DIR/app-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
EOF
chmod 0755 /etc/cron.daily/$APP-backup
echo "Cópias em $BACKUP_DIR (14 dias)"

# ---------------------------------------------------------------------------
ASSISTENTE="desativado (falta ANTHROPIC_API_KEY em $ENV_FILE)"
grep -Eq '^ANTHROPIC_API_KEY="?sk-' "$ENV_FILE" && ASSISTENTE="ativo"

cat <<EOF

$(printf '\033[1;32m')Instalação concluída.$(printf '\033[0m')

  Endereço:        $URL
  Primeiro acesso: o ecrã de entrada pede para criar a conta de administrador.
  Assistente:      $ASSISTENTE
  Configuração:    $ENV_FILE   (depois de alterar: sudo systemctl restart $APP)
  Registos:        journalctl -u $APP -f
  Atualizar:       git pull && sudo ./deploy/instalar.sh ${DOMINIO:+--dominio $DOMINIO --email $EMAIL}
EOF
