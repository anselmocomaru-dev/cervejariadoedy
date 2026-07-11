from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.schemas.enums import PedidoStatus
from app.services.cardapio import obter_item_cardapio
from app.services.database import get_supabase
from app.services.mesas import obter_mesa_por_token

_STATUS_COMANDA = ("PENDENTE", "EM_PREPARO", "ENTREGUE")


def _tz_brasil():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("America/Sao_Paulo")
    except Exception:
        # Fallback Windows sem tzdata: Brasil fixo UTC-3 (sem horario de verao).
        return timezone(timedelta(hours=-3))


_TZ_BR = _tz_brasil()

_PEDIDO_ATIVO_MSG = "Já existe um pedido em andamento para esta mesa."

_TRANSICOES_STATUS: dict[PedidoStatus, set[PedidoStatus]] = {
    PedidoStatus.PENDENTE: {PedidoStatus.EM_PREPARO, PedidoStatus.CANCELADO},
    PedidoStatus.EM_PREPARO: {PedidoStatus.ENTREGUE, PedidoStatus.CANCELADO},
    PedidoStatus.ENTREGUE: set(),
    PedidoStatus.CANCELADO: set(),
}


def criar_pedido(mesa_id: int) -> dict:
    sb = get_supabase()

    mesa = sb.table("mesas").select("id_mesa").eq("id_mesa", mesa_id).limit(1).execute()
    if not mesa.data:
        raise ValueError("Mesa não encontrada.")

    try:
        response = (
            sb.table("pedidos")
            .insert({"mesa_id": mesa_id, "status": "PENDENTE"})
            .execute()
        )
    except Exception as exc:
        if "idx_unico_pedido_ativo_por_mesa" in str(exc) or "duplicate key" in str(exc).lower():
            raise ValueError(_PEDIDO_ATIVO_MSG) from exc
        raise

    if not response.data:
        raise RuntimeError("Falha ao criar pedido.")
    return response.data[0]


def adicionar_item_pedido(
    pedido_id: UUID,
    item_id: int,
    quantidade: int,
    observacao: str | None,
) -> dict:
    if quantidade <= 0:
        raise ValueError("Quantidade deve ser maior que zero.")

    sb = get_supabase()

    pedido = (
        sb.table("pedidos")
        .select("id_pedido, status")
        .eq("id_pedido", str(pedido_id))
        .limit(1)
        .execute()
    )
    if not pedido.data:
        raise ValueError("Pedido não encontrado.")

    if pedido.data[0]["status"] not in ("PENDENTE", "EM_PREPARO"):
        raise ValueError("Pedido não aceita novos itens neste status.")

    item = obter_item_cardapio(item_id)
    if item is None:
        raise ValueError("Item do cardápio não encontrado ou indisponível.")

    payload = {
        "pedido_id": str(pedido_id),
        "item_id": item_id,
        "quantidade": quantidade,
        "observacao": observacao,
        "preco_unitario": item["preco"],
    }
    response = sb.table("pedido_itens").insert(payload).execute()
    if not response.data:
        raise RuntimeError("Falha ao adicionar item ao pedido.")
    return response.data[0]


def listar_painel() -> list[dict]:
    response = (
        get_supabase()
        .table("pedidos")
        .select("*, mesas(numero_mesa), pedido_itens(*, cardapio(nome))")
        .in_("status", ["PENDENTE", "EM_PREPARO"])
        .order("criado_em")
        .execute()
    )
    return response.data


def obter_pedido_ativo_mesa(mesa_id: int) -> dict | None:
    response = (
        get_supabase()
        .table("pedidos")
        .select("*")
        .eq("mesa_id", mesa_id)
        .in_("status", ["PENDENTE", "EM_PREPARO"])
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return response.data[0]


def atualizar_status_pedido(pedido_id: UUID, novo_status: PedidoStatus) -> dict:
    sb = get_supabase()
    atual = (
        sb.table("pedidos")
        .select("id_pedido, status")
        .eq("id_pedido", str(pedido_id))
        .limit(1)
        .execute()
    )
    if not atual.data:
        raise ValueError("Pedido não encontrado.")

    status_atual = PedidoStatus(atual.data[0]["status"])
    permitidos = _TRANSICOES_STATUS.get(status_atual, set())
    if novo_status not in permitidos:
        raise ValueError(
            f"Transição inválida: {status_atual.value} → {novo_status.value}."
        )

    response = (
        sb.table("pedidos")
        .update({"status": novo_status.value})
        .eq("id_pedido", str(pedido_id))
        .execute()
    )
    if not response.data:
        raise RuntimeError("Falha ao atualizar status do pedido.")
    return response.data[0]


def obter_status_pedido_mesa(pedido_id: UUID, mesa_id: int) -> dict:
    response = (
        get_supabase()
        .table("pedidos")
        .select("id_pedido, mesa_id, status, total_pedido")
        .eq("id_pedido", str(pedido_id))
        .eq("mesa_id", mesa_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise ValueError("Pedido não encontrado para esta mesa.")
    return response.data[0]


def _inicio_turno_hoje_utc_iso() -> str:
    agora_br = datetime.now(_TZ_BR)
    inicio_br = agora_br.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio_br.astimezone(timezone.utc).isoformat()


def obter_comanda_mesa(mesa_id: int, token_sessao: UUID) -> dict:
    mesa = obter_mesa_por_token(token_sessao)
    if mesa is None or mesa.id_mesa != mesa_id:
        raise ValueError("Token inválido para esta mesa.")

    inicio_turno = _inicio_turno_hoje_utc_iso()
    response = (
        get_supabase()
        .table("pedidos")
        .select(
            "id_pedido, status, total_pedido, criado_em, "
            "pedido_itens(id_item_pedido, quantidade, observacao, preco_unitario, cardapio(nome))"
        )
        .eq("mesa_id", mesa_id)
        .in_("status", list(_STATUS_COMANDA))
        .gte("criado_em", inicio_turno)
        .order("criado_em", desc=True)
        .execute()
    )

    pedidos = response.data or []
    if not pedidos:
        return {
            "total_comanda": Decimal("0.00"),
            "pedidos_vinculados": 0,
            "resumo_status": {"PENDENTE": 0, "EM_PREPARO": 0, "ENTREGUE": 0},
            "rodadas": [],
            "mensagem": "Nenhum consumo registrado hoje nesta mesa.",
        }

    resumo_status = {"PENDENTE": 0, "EM_PREPARO": 0, "ENTREGUE": 0}
    rodadas: list[dict] = []
    total_comanda = Decimal("0.00")
    total_pedidos = len(pedidos)

    for idx, pedido in enumerate(pedidos):
        status = pedido["status"]
        if status in resumo_status:
            resumo_status[status] += 1
        total_comanda += Decimal(str(pedido.get("total_pedido") or 0))

        itens_rodada: list[dict] = []
        for linha in pedido.get("pedido_itens") or []:
            cardapio = linha.get("cardapio") or {}
            qty = int(linha["quantidade"])
            preco = Decimal(str(linha["preco_unitario"]))
            itens_rodada.append(
                {
                    "id_item_pedido": linha["id_item_pedido"],
                    "nome": cardapio.get("nome") or "Item",
                    "quantidade": qty,
                    "preco_unitario": preco,
                    "subtotal": preco * qty,
                    "observacao": linha.get("observacao"),
                }
            )

        rodadas.append(
            {
                "sequencia_rodada": total_pedidos - idx,
                "pedido_id": pedido["id_pedido"],
                "status": status,
                "total_rodada": Decimal(str(pedido.get("total_pedido") or 0)),
                "criado_em": pedido["criado_em"],
                "itens": itens_rodada,
            }
        )

    return {
        "total_comanda": total_comanda,
        "pedidos_vinculados": total_pedidos,
        "resumo_status": resumo_status,
        "rodadas": rodadas,
        "mensagem": None,
    }
