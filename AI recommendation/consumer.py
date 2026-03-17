import json
from uuid import uuid4
import aio_pika
from aio_pika.abc import AbstractIncomingMessage
from llm_parser import parse_user_prompt_with_fallback
from schemas import SearchRequest
from services.rabbitmq.config import get_rabbitmq_settings

class SearchConsumer:
    def __init__(self) -> None:
        self.settings = get_rabbitmq_settings()
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.queue: aio_pika.abc.AbstractQueue | None = None

    async def start(self) -> None:
        self.connection = await aio_pika.connect_robust(self.settings.rabbitmq_url)
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=1)
        self.queue = await self.channel.declare_queue(
            self.settings.AI_SEARCH_QUEUE,
            durable=True,
        )

        await self.queue.consume(self.handle_message)
        print(f"[AI recommendation] Listening on queue: {self.settings.AI_SEARCH_QUEUE}")


    async def close(self) -> None:
        if self.connection:
            await self.connection.close()

    async def handle_message(self, message: AbstractIncomingMessage) -> None:
        async with message.process():
            payload = json.loads(message.body.decode("utf-8"))
            request = SearchRequest.model_validate(payload)

            parsed_response = parse_user_prompt_with_fallback(
                request.prompt,
                page=request.page,
            )

            if not message.reply_to or not self.channel:
                return

            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=parsed_response.model_dump_json().encode("utf-8"),
                    content_type="application/json",
                    correlation_id=message.correlation_id or str(uuid4()),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=message.reply_to,
            )
