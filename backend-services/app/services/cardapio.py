from app.schemas import Cardapio, Mesa
from app.services.database import get_supabase


def listar_cardapio_disponivel() -> list[Cardapio]:
    response = (
        get_supabase()
        .table("cardapio")
        .select("*")
        .eq("disponivel", True)
        .order("categoria")
        .order("nome")
        .execute()
    )
    return [Cardapio.model_validate(row) for row in response.data]


def obter_item_cardapio(item_id: int) -> dict | None:
    response = (
        get_supabase()
        .table("cardapio")
        .select("*")
        .eq("id_item", item_id)
        .eq("disponivel", True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return response.data[0]
