-- =========================================================================
-- MIGRAÇÃO 001: ESTRUTURA CORE COMPLETA - CERVEJARIA DO EDY
-- Racional: Schema síncrono com UNIQUE em nome, seeds e reset dev (Opção A).
--
-- ATENÇÃO: O bloco DROP abaixo é apenas para bootstrap/homologação via SQL Editor.
-- Nunca executar o DROP em produção com dados reais.
-- =========================================================================

-- 0. LIMPEZA SEGURA DO AMBIENTE DE DEV (CASCADE desfaz amarras de chaves)
DROP TABLE IF EXISTS public.pedido_itens CASCADE;
DROP TABLE IF EXISTS public.pedidos CASCADE;
DROP TABLE IF EXISTS public.cardapio CASCADE;
DROP TABLE IF EXISTS public.mesas CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE MESAS
CREATE TABLE public.mesas (
    id_mesa SERIAL PRIMARY KEY,
    numero_mesa VARCHAR(10) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'LIVRE',
    token_sessao UUID DEFAULT uuid_generate_v4() NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_mesas_status CHECK (status IN ('LIVRE', 'OCUPADA', 'FECHAMENTO'))
);

-- 2. TABELA DE CARDÁPIO (PRODUTOS)
CREATE TABLE public.cardapio (
    id_item SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT,
    preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
    categoria VARCHAR(30) NOT NULL,
    disponivel BOOLEAN NOT NULL DEFAULT true,
    imagem_url TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_cardapio_categoria CHECK (categoria IN ('BEBIDA', 'PETISCO', 'DRINK', 'SOBREMESA'))
);

-- 3. TABELA DE PEDIDOS
CREATE TABLE public.pedidos (
    id_pedido UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mesa_id INT NOT NULL REFERENCES public.mesas(id_mesa) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    total_pedido NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_pedido >= 0),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_pedidos_status CHECK (status IN ('PENDENTE', 'EM_PREPARO', 'ENTREGUE', 'CANCELADO'))
);

-- 4. TABELA DE ITENS DO PEDIDO
CREATE TABLE public.pedido_itens (
    id_item_pedido SERIAL PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id_pedido) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES public.cardapio(id_item) ON DELETE RESTRICT,
    quantidade INT NOT NULL CHECK (quantidade > 0),
    observacao TEXT,
    preco_unitario NUMERIC(10, 2) NOT NULL CHECK (preco_unitario >= 0)
);

-- =========================================================================
-- ÍNDICES, TRIGGER E SEGURANÇA
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_mesas_token ON public.mesas(token_sessao);
CREATE INDEX IF NOT EXISTS idx_pedidos_busca_painel ON public.pedidos(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cardapio_busca_pwa ON public.cardapio(disponivel, categoria);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unico_pedido_ativo_por_mesa
ON public.pedidos (mesa_id)
WHERE status IN ('PENDENTE', 'EM_PREPARO');

CREATE OR REPLACE FUNCTION public.atualizar_total_pedido()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.pedidos
        SET total_pedido = COALESCE(
                (SELECT SUM(quantidade * preco_unitario)
                 FROM public.pedido_itens
                 WHERE pedido_id = OLD.pedido_id),
                0.00
            ),
            atualizado_em = now()
        WHERE id_pedido = OLD.pedido_id;
        RETURN OLD;
    ELSE
        UPDATE public.pedidos
        SET total_pedido = COALESCE(
                (SELECT SUM(quantidade * preco_unitario)
                 FROM public.pedido_itens
                 WHERE pedido_id = NEW.pedido_id),
                0.00
            ),
            atualizado_em = now()
        WHERE id_pedido = NEW.pedido_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atualizar_total ON public.pedido_itens;
CREATE TRIGGER trg_atualizar_total
AFTER INSERT OR UPDATE OR DELETE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.atualizar_total_pedido();

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardapio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;

-- FastAPI usa SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
-- Sem políticas para anon/authenticated: bloqueio de acesso direto via PostgREST.

-- =========================================================================
-- SEEDS (IDEMPOTENTES)
-- =========================================================================
INSERT INTO public.mesas (numero_mesa) VALUES ('01'), ('02'), ('03'), ('04'), ('05')
ON CONFLICT (numero_mesa) DO NOTHING;

INSERT INTO public.cardapio (nome, descricao, preco, categoria, disponivel, imagem_url)
VALUES
('Chopp Pilsen 300ml', 'Clássico, gelado e com colarinho cremoso.', 9.50, 'BEBIDA', true, NULL),
('Chopp Artesanal IPA 500ml', 'Amargor marcante com notas cítricas e aromáticas.', 16.00, 'BEBIDA', true, NULL),
('Porção de Batata Rústica', 'Batatas crocantes com alecrim, alho confitado e maionese da casa.', 28.90, 'PETISCO', true, NULL),
('Frango a Passarinho do Edy', 'Crocante por fora, suculento por dentro, salpicado com alho frito.', 42.00, 'PETISCO', true, NULL),
('Drink Gin Tônica Tropical', 'Gin premium, água tônica, fatias de laranja e um toque de maracujá.', 24.00, 'DRINK', true, NULL)
ON CONFLICT (nome) DO NOTHING;
