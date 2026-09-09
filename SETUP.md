# PRAMĀṆA — Setup Guide

## Prerequisites

- **Node.js** ≥ 20.0.0
- **Docker** + **Docker Compose** (for PostgreSQL and Neo4j)
- **Git**

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd pramana
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in required values:

| Variable | Required | Where to get it |
|----------|----------|----------------|
| `FIREBASE_PROJECT_ID` | Yes | [Firebase Console](https://console.firebase.google.com) → Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase Console → Service Accounts → Generate key |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase Console → Service Accounts → Generate key |
| `VITE_FIREBASE_*` | Yes | Firebase Console → Project Settings → Web app config |
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com/apikey) |
| `NEWSAPI_KEY` | Optional | [NewsAPI.org](https://newsapi.org) |
| `DATABASE_URL` | Has default | Default works with Docker Compose |
| `NEO4J_*` | Has default | Default works with Docker Compose |

### 3. Start databases

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** with pgvector on port `5433` (mapped to avoid conflicts with local postgres on 5432)
- **Neo4j 5** on ports `7474` (browser) and `7687` (Bolt)

Verify they're running:
```bash
docker compose ps
```

### 4. Run database migrations & seed sources

```bash
npm run db:migrate
```
*Applies 15 PostgreSQL tables, pgvector HNSW indexes, Neo4j schema constraints, and seeds default global news sources.*

### 5. Start the application

```bash
npm run dev
```

Or run them individually:
```bash
npm run dev:server   # Fastify backend on port 3001
npm run dev:client   # Vite React frontend (usually on port 5173 or 5174)
```

### 6. Access the Application

- Open `http://localhost:5173` (or `http://localhost:5174`) in your browser
- Click **"Explore Intelligence Platform (Guest Access) →"** to immediately browse live news intelligence, event dossiers, and the real-time live wire
- Check the server health: `http://localhost:3001/api/health`
- Check readiness: `http://localhost:3001/api/health/ready`

## Running Tests

```bash
# Unit + integration tests
npm test

# End-to-end tests (requires running app)
npm run test:e2e
```

## Project Structure

```
pramana/
├── client/           # React + Vite frontend
├── server/           # Node.js + Fastify backend
├── e2e/              # Playwright E2E tests
├── docker-compose.yml
├── .env.example
└── package.json      # Root workspace
```

## External Services

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Firebase Auth | Google OAuth login | Yes (always free) |
| Google Gemini | Embeddings, LLM, claim extraction | Yes (free quota) |
| GDELT | Global news events | Yes (public data) |
| NewsAPI | Additional news sources | Yes (developer plan) |
| PostgreSQL | Primary database | Local via Docker |
| Neo4j | Knowledge graph | Local via Docker |

## Troubleshooting

### Server won't start
- Check that `.env` exists with required variables
- Check that Docker containers are running: `docker compose ps`
- Check PostgreSQL: `docker compose logs postgres`
- Check Neo4j: `docker compose logs neo4j`

### Database connection errors
- Ensure Docker Compose is running
- Ensure ports 5432 and 7687 are not in use by other services
- Reset databases: `docker compose down -v && docker compose up -d`
