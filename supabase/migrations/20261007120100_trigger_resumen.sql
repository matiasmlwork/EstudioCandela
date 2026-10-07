-- Al insertar una respuesta, se llama a la Edge Function `generar-resumen` (asíncrono, vía pg_net).
-- Necesita dos secretos en el Vault (se cargan una sola vez, ver README):
--   resumen_url     https://<proyecto>.supabase.co/functions/v1/generar-resumen
--   webhook_secret  el mismo valor que WEBHOOK_SECRET de la función
create extension if not exists pg_net with schema extensions;

create or replace function public.avisar_respuesta_nueva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'resumen_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';
  if v_url is null or v_secret is null then
    raise warning 'generar-resumen: faltan los secretos resumen_url / webhook_secret en el Vault';
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('type', 'INSERT', 'record', jsonb_build_object('id', new.id)),
    timeout_milliseconds := 60000
  );
  return new;
end;
$$;

revoke all on function public.avisar_respuesta_nueva() from public, anon, authenticated;

drop trigger if exists respuesta_nueva on public.respuestas_habitar;
create trigger respuesta_nueva
  after insert on public.respuestas_habitar
  for each row execute function public.avisar_respuesta_nueva();
