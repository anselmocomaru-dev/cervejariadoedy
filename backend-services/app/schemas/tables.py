from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import CardapioCategoria, MesaStatus, PedidoStatus


class Mesa(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_mesa: int
    numero_mesa: str = Field(max_length=10)
    status: MesaStatus
    token_sessao: UUID
    criado_em: datetime
    atualizado_em: datetime


class MesaUpdate(BaseModel):
    status: MesaStatus | None = None
    token_sessao: UUID | None = None


class CardapioCreate(BaseModel):
    nome: str = Field(max_length=100)
    descricao: str | None = None
    preco: Decimal = Field(ge=0, decimal_places=2)
    categoria: CardapioCategoria
    disponivel: bool = True
    imagem_url: str | None = None


class Cardapio(CardapioCreate):
    model_config = ConfigDict(from_attributes=True)

    id_item: int
    criado_em: datetime


class PedidoCreate(BaseModel):
    mesa_id: int


class Pedido(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_pedido: UUID
    mesa_id: int
    status: PedidoStatus
    total_pedido: Decimal = Field(ge=0, decimal_places=2)
    criado_em: datetime
    atualizado_em: datetime


class PedidoItemCreate(BaseModel):
    item_id: int
    quantidade: int = Field(gt=0)
    observacao: str | None = None
    preco_unitario: Decimal = Field(ge=0, decimal_places=2)


class PedidoItem(PedidoItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id_item_pedido: int
    pedido_id: UUID
