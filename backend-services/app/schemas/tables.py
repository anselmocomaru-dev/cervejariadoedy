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


class PedidoStatusUpdate(BaseModel):
    status: PedidoStatus


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


class PedidoItemAdd(BaseModel):
    item_id: int
    quantidade: int = Field(gt=0)
    observacao: str | None = None


class PedidoItem(PedidoItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id_item_pedido: int
    pedido_id: UUID


class ComandaRodadaItem(BaseModel):
    id_item_pedido: int
    nome: str
    quantidade: int = Field(gt=0)
    preco_unitario: Decimal = Field(ge=0, decimal_places=2)
    subtotal: Decimal = Field(ge=0, decimal_places=2)
    observacao: str | None = None


class ComandaRodada(BaseModel):
    sequencia_rodada: int = Field(ge=1)
    pedido_id: UUID
    status: PedidoStatus
    total_rodada: Decimal = Field(ge=0, decimal_places=2)
    criado_em: datetime
    itens: list[ComandaRodadaItem]


class ComandaMesa(BaseModel):
    total_comanda: Decimal = Field(ge=0, decimal_places=2)
    pedidos_vinculados: int = Field(ge=0)
    resumo_status: dict[str, int]
    rodadas: list[ComandaRodada]
    mensagem: str | None = None
