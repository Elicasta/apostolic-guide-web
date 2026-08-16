-- Supabase advisor hardening for the runtime trigger helper.
create or replace function public.sol_runtime_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.sol_runtime_touch_updated_at() from public, anon, authenticated;
