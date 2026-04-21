# Ollama setup for feedback auto-categorization

This project can run category classification locally through Ollama.

## 1) Start infrastructure

```bash
docker compose up -d postgres localstack ollama
```

## 2) Pull the model once

```bash
docker exec -it feedback-ollama ollama pull llama3.1:8b
```

## 3) Deploy lambdas

```bash
./deploy.sh
```

`deploy.sh` configures `feedback-api` with:

- `AI_CATEGORIZER_URL=http://feedback-ollama:11434/v1/chat/completions`
- `AI_CATEGORIZER_MODEL=llama3.1:8b`

## 4) Quick verification

Use a create feedback call and check logs for successful LLM classification or fallback messages.

Example payload:

```json
{
  "tenant_id": "default-tenant",
  "user_id": "default-user",
  "title": "App crashes when I upload PDF",
  "description": "Every time I upload a PDF larger than 5MB the screen freezes and API returns 500."
}
```

Expected category from LLM/heuristics: `DEFECT`.

## Notes

- If Ollama is down or model is missing, API falls back to keyword heuristics.
- First model pull can take several minutes depending on network speed.
