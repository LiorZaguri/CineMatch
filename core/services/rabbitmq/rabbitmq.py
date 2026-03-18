"""
RabbitMQ Service Module.

This module manages the asynchronous connection to RabbitMQ using `aio_pika`.
It handles the connection lifecycle, including establishing robust connections,
initializing required exchanges during startup, and gracefully closing
the connection upon application shutdown.
"""

import aio_pika

from .config import get_rabbitmq_settings

# Global variable holding the active RabbitMQ connection.
_rabbitmq_connection: aio_pika.RobustConnection | None = None



async def get_rabbitmq_connection() -> aio_pika.RobustConnection:
    """
    Establishes or retrieves a robust connection to RabbitMQ.

    This function acts as a singleton factory. It checks if an active
    connection already exists and is open; if not, it fetches the settings
    and creates a new robust connection.
    
    Returns:
        aio_pika.RobustConnection: The active, robust RabbitMQ connection.
    """
    global _rabbitmq_connection
    if _rabbitmq_connection is None or _rabbitmq_connection.is_closed:
        settings = get_rabbitmq_settings()
        _rabbitmq_connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        
    return _rabbitmq_connection



async def init_rabbitmq():
    """
    Initializes RabbitMQ resources on application startup.
    
    Connects to the RabbitMQ broker and declares the main topic exchange
    ('cinematch.events'). This ensures that the infrastructure exists
    before any services attempt to publish or consume messages.
    
    Catches and logs any exceptions that occur during initialization
    to prevent application startup failure due to broker unavailability.
    """
    try:
        connection = await get_rabbitmq_connection()
        async with connection.channel() as channel:
            # Declare the topic exchange. This operation is idempotent.
            await channel.declare_exchange(
                name="cinematch.events",
                type=aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
        print("[RabbitMQ] Successfully connected and declared exchange 'cinematch.events'.", flush=True)
    except Exception as e:
        # Log critical failure (e.g., if the broker is unreachable)
        print(f"[RabbitMQ] CRITICAL: Failed to connect to RabbitMQ during startup: {e}", flush=True)

async def close_rabbitmq():
    """
    Closes the RabbitMQ connection gracefully during application shutdown.
    
    Checks if the global connection exists and is open before attempting
    to close it, preventing potential errors during teardown.
    """
    global _rabbitmq_connection
    if _rabbitmq_connection and not _rabbitmq_connection.is_closed:
        await _rabbitmq_connection.close()
        print("[RabbitMQ] Connection closed gracefully.", flush=True)