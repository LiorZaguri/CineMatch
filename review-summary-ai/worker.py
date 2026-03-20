from uuid import uuid4

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from client import create_openai_client
from config import get_settings
from pipeline import ReviewSummaryPipeline
from schemas import SummaryRequest, SummaryResponse


class ReviewSummaryWorker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.queue: aio_pika.abc.AbstractQueue | None = None
        self.pipeline: ReviewSummaryPipeline | None = None

    async def start(self) -> None:
        client = create_openai_client()
        self.pipeline = ReviewSummaryPipeline(
            client=client,
            model=self.settings.LLM_MODEL,
        )
        self.connection = await aio_pika.connect_robust(self.settings.rabbitmq_url)
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=1)
        self.queue = await self.channel.declare_queue(
            self.settings.AI_REVIEW_SUMMARIZER_QUEUE,
            durable=True,
        )
        await self.queue.consume(self.handle_message)

    async def close(self) -> None:
        if self.connection and not self.connection.is_closed:
            await self.connection.close()

    async def handle_message(self, message: AbstractIncomingMessage) -> None:
        async with message.process():
            if not message.reply_to or not self.channel:
                return

            try:
                payload = SummaryRequest.model_validate_json(message.body.decode("utf-8"))
            except Exception:
                response = SummaryResponse(
                    ok=False,
                    error="invalid_request",
                )
            else:
                try:
                    if self.pipeline is None:
                        raise RuntimeError("worker_not_initialized")
                    summary = self.pipeline.summarize_with_fallback(
                        payload.reviews,
                        movie_title=payload.movie_title,
                    )
                except Exception:
                    response = SummaryResponse(
                        ok=False,
                        error="summarization_failed",
                    )
                else:
                    response = SummaryResponse(
                        ok=True,
                        summary=summary,
                    )

            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=response.model_dump_json().encode("utf-8"),
                    content_type="application/json",
                    correlation_id=message.correlation_id or str(uuid4()),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=message.reply_to,
            )
