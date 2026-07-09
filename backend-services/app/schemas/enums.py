from enum import StrEnum


class MesaStatus(StrEnum):
    LIVRE = "LIVRE"
    OCUPADA = "OCUPADA"
    FECHAMENTO = "FECHAMENTO"


class CardapioCategoria(StrEnum):
    BEBIDA = "BEBIDA"
    PETISCO = "PETISCO"
    DRINK = "DRINK"
    SOBREMESA = "SOBREMESA"


class PedidoStatus(StrEnum):
    PENDENTE = "PENDENTE"
    EM_PREPARO = "EM_PREPARO"
    ENTREGUE = "ENTREGUE"
    CANCELADO = "CANCELADO"
