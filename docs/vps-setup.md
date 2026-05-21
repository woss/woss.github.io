# VPS Setup

One-time setup for deploying woss.io on a VPS with Docker.

## Prerequisites

- Docker and docker compose plugin installed on VPS
- Host reverse proxy (nginx/Caddy) already configured for woss.io, proxying to `http://localhost:3000`
- Docker Hub access token (generate at https://hub.docker.com/settings/security)

## GitHub Secrets

Add these to the GitHub repo (Settings → Secrets and variables → Actions):

| Secret             | Description                           |
| ------------------ | ------------------------------------- |
| `DOCKER_USERNAME`  | Docker Hub username                   |
| `DOCKER_PASSWORD`  | Docker Hub access token (not password) |
| `VPS_HOST`         | VPS IP address or hostname            |
| `VPS_USERNAME`     | SSH username (e.g. root, deploy)      |
| `VPS_SSH_KEY`      | Private SSH key for VPS access        |

## Initial Setup

SSH into the VPS and run:

```bash
# Create app directory
sudo mkdir -p /opt/woss.io
sudo chown $USER:$USER /opt/woss.io
cd /opt/woss.io

# Create production .env file
cat > .env << 'EOF'
WEB_ORIGIN=https://woss.io
OPENAI_API_KEY=
OPENAI_BASE_URL=http://ollama:11434/v1
OPENAI_MODEL=qwen2.5:3b
GITHUB_TOKEN=your_github_token_here
MCP_SERVERS=[{"id":"github","label":"GitHub MCP","url":"https://api.githubcopilot.com/mcp/","token":"$GITHUB_TOKEN","readonly":true,"enabled":true}]
WOSS_USER_WEBHOOK_URL=
WOSS_USER_WEBHOOK_TOKEN=
WOSS_MAX_MESSAGES=50
WOSS_MAX_CHATS=100
EOF

# Create docker-compose.yml
cat > docker-compose.yml << 'COMPEOF'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: woss-ollama
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'ollama', 'list']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  ollama-init:
    image: ollama/ollama:latest
    container_name: woss-ollama-init
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=http://ollama:11434
    command: ['pull', 'qwen2.5:3b']
    depends_on:
      ollama:
        condition: service_healthy
    restart: 'no'

  app:
    image: woss/woss.io:latest
    container_name: woss-app
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    depends_on:
      ollama-init:
        condition: service_completed_successfully
    restart: unless-stopped

volumes:
  ollama_data:
COMPEOF

# Start services
docker compose up -d

# Check logs
docker compose logs -f
```

## Updating

On every push to `main`, the CI pipeline automatically:
1. Builds the Docker image
2. Pushes to Docker Hub (`woss/woss.io:latest`)
3. SSHs into the VPS and runs `docker compose pull && docker compose up -d`
