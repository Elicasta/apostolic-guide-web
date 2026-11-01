-- Phase 3 rollback only after approved app rollback.
drop function if exists public.apply_studio_threads_code(jsonb);
