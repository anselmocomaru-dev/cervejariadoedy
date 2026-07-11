import asyncio
import logging
import os
from typing import Any

from realtime.types import RealtimePostgresChangesListenEvent
from supabase import acreate_client

logger = logging.getLogger("uvicorn.error")


class RealtimeCozinhaService:
    """
    Escuta postgres_changes no Supabase (async) e retransmite via SSE
    para o painel da cozinha/bar.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: Any = None
        self._channel: Any = None
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def register(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        self._subscribers.add(queue)
        return queue

    def unregister(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    def _normalize_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = payload.get("data", {})
        return {
            "type": "refresh",
            "table": data.get("table"),
            "event": data.get("type"),
            "record": data.get("record"),
            "old_record": data.get("old_record"),
        }

    def _handle_change(self, payload: dict[str, Any]) -> None:
        event = self._normalize_event(payload)
        logger.info(
            "[REALTIME BAR] %s em %s | pedido=%s",
            event.get("event"),
            event.get("table"),
            (event.get("record") or {}).get("pedido_id")
            or (event.get("record") or {}).get("id_pedido"),
        )
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._dispatch, event)

    def _dispatch(self, event: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Fila SSE cheia; cliente lento descartado.")
                self._subscribers.discard(queue)

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self._client = await acreate_client(url, key)

        channel = self._client.channel("painel_cozinha_changes")
        channel.on_postgres_changes(
            RealtimePostgresChangesListenEvent.Insert,
            self._handle_change,
            schema="public",
            table="pedido_itens",
        )
        channel.on_postgres_changes(
            RealtimePostgresChangesListenEvent.Update,
            self._handle_change,
            schema="public",
            table="pedidos",
        )
        channel.on_postgres_changes(
            RealtimePostgresChangesListenEvent.Insert,
            self._handle_change,
            schema="public",
            table="pedidos",
        )
        await channel.subscribe()
        self._channel = channel
        logger.info("Canal Supabase Realtime assinado (pedidos + pedido_itens).")

    async def stop(self) -> None:
        if self._channel is not None:
            await self._channel.unsubscribe()
            self._channel = None
        if self._client is not None:
            await self._client.remove_all_channels()
            self._client = None
        self._subscribers.clear()
        logger.info("Canal Supabase Realtime encerrado.")


realtime_cozinha_manager = RealtimeCozinhaService()
