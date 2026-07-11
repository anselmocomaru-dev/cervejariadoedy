from uuid import UUID

from app.schemas import Mesa
from app.services.database import get_supabase


def obter_mesa_por_token(token_sessao: UUID) -> Mesa | None:
    response = (
        get_supabase()
        .table("mesas")
        .select("*")
        .eq("token_sessao", str(token_sessao))
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return Mesa.model_validate(response.data[0])


def listar_mesas_com_links(base_url: str) -> list[dict]:
    response = (
        get_supabase()
        .table("mesas")
        .select("id_mesa, numero_mesa, status, token_sessao")
        .order("numero_mesa")
        .execute()
    )
    return [
        {
            **row,
            "url_cliente": f"{base_url.rstrip('/')}/cliente?t={row['token_sessao']}",
        }
        for row in response.data
    ]
