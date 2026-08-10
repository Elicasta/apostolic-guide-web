revoke all on function public.link_browser_identity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_browser_identity(uuid, uuid) to service_role;

revoke all on function public.sync_email_subscriber_to_person() from public, anon, authenticated;
grant execute on function public.sync_email_subscriber_to_person() to service_role;
