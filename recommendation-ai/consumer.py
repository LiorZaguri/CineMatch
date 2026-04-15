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
        """
        Initializes the RabbitMQ connection and sets up the search consumer.
        
        Uses connect_robust to ensure automatic reconnection if the broker 
        becomes unavailable. Catches initial connection errors to prevent 
        the application from crashing immediately.
        """
        try:
            self.connection = await aio_pika.connect_robust(self.settings.rabbitmq_url)
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)
            self.queue = await self.channel.declare_queue(
                self.settings.AI_SEARCH_QUEUE,
                durable=True,
            )

            await self.queue.consume(self.handle_message)
            print(f"[AI recommendation] Successfully connected to RabbitMQ and listening on: {self.settings.AI_SEARCH_QUEUE}")
        except Exception as e:
            print(f"[AI recommendation] CRITICAL ERROR: Could not connect to RabbitMQ: {e}")
            print("[AI recommendation] The consumer will not be active until RabbitMQ is reachable.")
            # We don't re-raise here to allow the FastAPI app to start, but the service
            # functionality will be limited until the connection is established.
            # aio_pika.connect_robust will NOT automatically start if it fails initially 
            # without being awaited, so we might need manual retry logic if we want 
            # it to recover from a complete initial outage.
            raise e


    async def close(self) -> None:
        if self.connection:
            await self.connection.close()

    async def handle_message(self, message: AbstractIncomingMessage) -> None:
        async with message.process():
            payload = json.loads(message.body.decode("utf-8"))
            request = SearchRequest.model_validate(payload)

            parsed_response = await parse_user_prompt_with_fallback(
                request.prompt,
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
