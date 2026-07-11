-- =========================================================================
-- MIGRAÇÃO 002: HABILITAR SUPABASE REALTIME (PAINEL COZINHA/BAR)
-- Pré-requisito: 001_initial_schema.sql aplicada.
-- Idempotente: seguro reexecutar no SQL Editor.
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'pedidos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'pedido_itens'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_itens;
    END IF;
END $$;
