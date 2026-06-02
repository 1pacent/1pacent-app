#!/usr/bin/env bash
set -euo pipefail

cd /opt/n8n

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml not found in /opt/n8n"
  exit 1
fi

DB_PASSWORD="${TRADIE_DB_PASSWORD:-$(openssl rand -base64 32 | tr -d '\n')}"

cat > tradie-postgres.env <<EOF
POSTGRES_DB=tradie_app
POSTGRES_USER=tradie_app
POSTGRES_PASSWORD=${DB_PASSWORD}
EOF

cat > docker-compose.tradie-db.yml <<'EOF'
services:
  tradie-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - tradie-postgres.env
    volumes:
      - tradie_postgres_data:/var/lib/postgresql/data
      - ./tradie_app_schema.sql:/docker-entrypoint-initdb.d/001_tradie_app_schema.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tradie_app -d tradie_app"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - default

volumes:
  tradie_postgres_data:
EOF

if [ ! -f tradie_app_schema.sql ]; then
  echo "tradie_app_schema.sql is missing. Copy it to /opt/n8n/tradie_app_schema.sql before running this script."
  exit 1
fi

docker compose --env-file stack.env -f docker-compose.yml -f docker-compose.tradie-db.yml up -d tradie-postgres

echo "Waiting for Postgres to become healthy..."
for i in {1..30}; do
  if docker exec n8n-tradie-postgres-1 pg_isready -U tradie_app -d tradie_app >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec -i n8n-tradie-postgres-1 psql -U tradie_app -d tradie_app < tradie_app_schema.sql

echo
echo "Tradie App Postgres is ready."
echo "Host from n8n container: tradie-postgres"
echo "Port: 5432"
echo "Database: tradie_app"
echo "User: tradie_app"
echo "Password: ${DB_PASSWORD}"
echo
echo "IMPORTANT: Save this password somewhere safe."
