# Generative Pets - Backend

Backend Node/Express/TypeScript with Prisma (SQLite) powering a multi-chat advisor for pet adoption. Works with LM Studio (OpenAI-compatible API).

## Setup

1. Install deps:
```bash
npm i
```
2. Configure env in `.env`:
```bash
PORT=4000
DATABASE_URL="file:./dev.db"
LLM_BASE_URL="http://127.0.0.1:1234/v1"
LLM_MODEL="qwen/qwen3-8b"
```
3. Prisma
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```
4. Dev
```bash
npm run dev
```

## API
- `GET /health`
- `POST /chats { title, systemPrompt? }`
- `GET /chats`
- `GET /chats/:id`
- `PATCH /chats/:id/prompt { systemPrompt }`
- `DELETE /chats/:id`
- `POST /chats/:id/reset` (clear messages)
- `PUT /chats/:id/preferences { size, housing, allergies, activity }`
- `POST /chats/:id/messages { content }` → stores user+assistant messages
- `GET /chats/:id/suggestions` → match animals from preferences
- `GET /animals`
- `POST /animals` (basic create)

## Notes
- LM Studio: start the local server and set base URL/model in `.env`.
- Data model in `prisma/schema.prisma`. Client generated into `src/generated/prisma`.
- V2: image upload will be added later.
