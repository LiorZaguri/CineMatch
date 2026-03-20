# review-summary-ai

Minimal worker-side logic for review summarization.

## What this folder does

- accepts a batch of already-fetched reviews
- validates and normalizes them
- sends them to an OpenAI-compatible model
- returns one consensus summary string
- can listen on RabbitMQ and reply with that summary

## What `core` needs to provide

Only this:

- fetch the reviews
- publish `reviews[]` to this worker queue using RabbitMQ RPC
- receive back either a success payload or an error payload

Anything related to caching or returning data to the frontend remains outside this folder.

## Files

- `config.py` - local settings from `.env`
- `client.py` - OpenAI client initialization
- `schemas.py` - request and review validation
- `prompt.py` - summarization prompt
- `pipeline.py` - model call and summary extraction
- `worker.py` - minimal RabbitMQ request/reply worker
- `main.py` - FastAPI app with worker startup and `/health`
- `Dockerfile` - minimal container entrypoint

## Message shape

Request:

```json
{
  "movie_title": "Interstellar",
  "reviews": [
    { "rating": 9, "content": "Great acting and sharp pacing." },
    { "rating": 7, "content": "Strong performances, though a bit long." }
  ]
}
```

Response:

```json
{
  "ok": true,
  "summary": "Consensus summary text",
  "error": null
}
```

Error response:

```json
{
  "ok": false,
  "summary": null,
  "error": "summarization_failed"
}
```

## How to use

Direct Python usage:

```python
from client import create_openai_client
from pipeline import ReviewSummaryPipeline

client = create_openai_client()
pipeline = ReviewSummaryPipeline(client=client)

summary = pipeline.summarize([
    {"rating": 9, "content": "Great acting and sharp pacing."},
    {"rating": 7, "content": "Strong performances, though a bit long."}
], movie_title="Interstellar")
```

RabbitMQ worker usage:

1. Provide secrets and runtime config with environment variables or `--env-file`
2. Start the service with `uvicorn main:app --host 0.0.0.0 --port 8002`
3. Publish the request body to `AI_REVIEW_SUMMARIZER_QUEUE`
4. Set `reply_to` to your callback queue
5. Set `correlation_id` so the caller can match responses to requests
6. Read the response JSON from the reply queue

The worker uses RabbitMQ RPC-style messaging. It consumes requests from the configured worker queue and publishes the reply to the queue named in `reply_to`.

Health check:

- `GET /health` returns the service status and configured worker queue
