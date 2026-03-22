"""
RabbitMQ RPC Client Module.

This module provides an asynchronous RPC (Remote Procedure Call) client
implementation using RabbitMQ and aio_pika. It allows the Core service
to send requests to other services (like the AI Recommendation service)
and await their responses over AMQP.
"""
import asyncio
import json
import uuid

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from .config import get_rabbitmq_settings


class RabbitMQRPCClient:
    """
    An asynchronous RPC client using RabbitMQ.
    
    This client creates an exclusive, auto-deleting callback queue to receive
    responses for the messages it publishes. It uses correlation IDs to map
    incoming responses back to the original request futures.
    """

    def __init__(self, target_queue: str):
        """
        Initializes the RPC client.

        Args:
            target_queue (str): The name of the RabbitMQ queue where requests
                                should be sent (the target service's queue).
        """
        self.target_queue = target_queue
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.callback_queue: aio_pika.abc.AbstractQueue | None = None
        self.futures: dict[str, asyncio.Future] = {}

    async def connect(self):
        """
        Connects the RPC client to RabbitMQ and sets up the callback queue.
        
        This method must be called before sending any RPC requests. It declares
        a temporary, exclusive queue for receiving responses and starts consuming
        from it.
        """

        # Local import to prevent circular dependency issues, as rabbitmq.py
        # needs to import the instantiated clients from this module.
        from .rabbitmq import get_rabbitmq_connection

        connection = await get_rabbitmq_connection()
        self.channel = await connection.channel()

        # Declare a temporary queue exclusively for this client to receive replies
        self.callback_queue = await self.channel.declare_queue(
            exclusive=True,
            auto_delete=True,
        )

        # Start listening for messages on the callback queue
        await self.callback_queue.consume(self.on_response)
        print(f"[RPC Client -> {self.target_queue}] Listening on: {self.callback_queue.name}", flush=True)


    async def on_response(self, message: AbstractIncomingMessage) -> None:
        """
        Callback triggered when a response message is received.
        
        It matches the message's correlation ID to an active future,
        parses the JSON body, and resolves the future with the result.
        
        Args:
            message (AbstractIncomingMessage): The incoming response message from RabbitMQ.
        """
        # message.process() automatically acknowledges (ACKs) the message upon successful processing,
        # or rejects (NACKs) it if an exception occurs.
        async with message.process():
            correlation_id = message.correlation_id
            if not isinstance(correlation_id, str):
                return

            # Retrieve and remove the future associated with this correlation ID
            future = self.futures.pop(correlation_id, None)
            if future and not future.done():
                try:
                    # Decode and parse the JSON response
                    result = json.loads(message.body.decode())
                    future.set_result(result)
                except Exception as e:
                    future.set_exception(e)

    async def call(self, payload: dict | str) -> dict:
        """
        Sends an RPC request to the target queue and awaits the response.
        
        Args:
            payload (dict | str): The data to send. If a dict, it will be JSON encoded.
            
        Returns:
            dict: The JSON-decoded response from the target service.
            
        Raises:
            RuntimeError: If the RPC client has not been connected.
        """
        if not self.channel or not self.callback_queue:
            raise RuntimeError(f"RPC Client for {self.target_queue} is not connected.")

        # Generate a unique correlation ID for this request to match the response later
        correlation_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        
        # Create a Future object to await the response asynchronously
        future = loop.create_future()

        self.futures[correlation_id] = future

        # Ensure payload is a JSON-encoded bytes object
        body = payload.encode() if isinstance(payload, str) else json.dumps(payload).encode()

        # Publish the request to the default exchange, routing it to the target service's queue
        await self.channel.default_exchange.publish(
            aio_pika.Message(
                body=body,
                content_type="application/json",
                correlation_id=correlation_id,
                reply_to=self.callback_queue.name,
            ),
            routing_key=self.target_queue,
        )

        # Suspend execution until the on_response callback sets the result on this Future
        return await future


# ==========================================
# Instantiate specific clients 
# ==========================================
# This section acts as a registry for RPC clients used throughout the application.

settings = get_rabbitmq_settings()

# Movie Recommendation AI Client:
# Used to request AI-generated movie recommendations based on user reviews or preferences.
recommendation_rpc = RabbitMQRPCClient(target_queue=settings.AI_RECOMMENDATION_QUEUE)

# Used to request AI-generated movie recommendations based on user reviews or preferences.
summary_rpc = RabbitMQRPCClient(target_queue=settings.AI_REVIEW_SUMMARIZER_QUEUE)

