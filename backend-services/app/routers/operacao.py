import asyncio
import json
import os
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.schemas import (
    Cardapio,
    ComandaMesa,
    Mesa,
    Pedido,
    PedidoCreate,
    PedidoItem,
    PedidoItemAdd,
    PedidoStatusUpdate,
)
from app.services.cardapio import listar_cardapio_disponivel
from app.services.mesas import listar_mesas_com_links, obter_mesa_por_token
from app.services.pedidos import (
    adicionar_item_pedido,
    atualizar_status_pedido,
    criar_pedido,
    listar_painel,
    obter_comanda_mesa,
    obter_pedido_ativo_mesa,
    obter_status_pedido_mesa,
)
from app.services.realtime_cozinha import realtime_cozinha_manager

router = APIRouter(prefix="/api", tags=["operacao"])


@router.get("/cardapio", response_model=list[Cardapio])
def get_cardapio() -> list[Cardapio]:
    return listar_cardapio_disponivel()


@router.get("/mesas/sessao/{token_sessao}", response_model=Mesa)
def get_mesa_por_sessao(token_sessao: UUID) -> Mesa:
    mesa = obter_mesa_por_token(token_sessao)
    if mesa is None:
        raise HTTPException(status_code=404, detail="Mesa não encontrada para este token.")
    return mesa


@router.get("/mesas/links-homolog")
def get_mesas_links_homolog(request: Request) -> list[dict]:
    """Lista URLs do PWA por mesa — apenas homologação (APP_ENV=development)."""
    if os.getenv("APP_ENV", "development") != "development":
        raise HTTPException(status_code=404, detail="Não disponível.")
    base = str(request.base_url).rstrip("/")
    return listar_mesas_com_links(base)


@router.get("/pedidos/ativos/mesa/{mesa_id}", response_model=Pedido)
def get_pedido_ativo_por_mesa(mesa_id: int) -> Pedido:
    pedido = obter_pedido_ativo_mesa(mesa_id)
    if pedido is None:
        raise HTTPException(status_code=404, detail="Nenhum pedido ativo para esta mesa.")
    return Pedido.model_validate(pedido)


@router.post("/pedidos", response_model=Pedido)
def post_pedido(body: PedidoCreate) -> Pedido:
    try:
        data = criar_pedido(body.mesa_id)
        return Pedido.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pedidos/{pedido_id}/itens", response_model=PedidoItem)
def post_item_pedido(pedido_id: UUID, body: PedidoItemAdd) -> PedidoItem:
    try:
        data = adicionar_item_pedido(
            pedido_id=pedido_id,
            item_id=body.item_id,
            quantidade=body.quantidade,
            observacao=body.observacao,
        )
        return PedidoItem.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/pedidos/{pedido_id}/status", response_model=Pedido)
def patch_pedido_status(pedido_id: UUID, body: PedidoStatusUpdate) -> Pedido:
    try:
        data = atualizar_status_pedido(pedido_id, body.status)
        return Pedido.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/pedidos/mesa/{mesa_id}/comanda", response_model=ComandaMesa)
def get_comanda_mesa(mesa_id: int, token_sessao: UUID) -> ComandaMesa:
    try:
        data = obter_comanda_mesa(mesa_id, token_sessao)
        return ComandaMesa.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/pedidos/{pedido_id}/status")
def get_status_pedido_cliente(pedido_id: UUID, mesa_id: int) -> dict:
    """Lookup leve para o PWA do cliente acompanhar o pedido da sua mesa."""
    try:
        return obter_status_pedido_mesa(pedido_id, mesa_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/pedidos/painel", response_model=list[dict])
def get_painel_pedidos() -> list[dict]:
    return listar_painel()


@router.get("/pedidos/painel/stream")
async def stream_painel_pedidos(request: Request) -> StreamingResponse:
    async def event_generator():
        queue = realtime_cozinha_manager.register()
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            realtime_cozinha_manager.unregister(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
