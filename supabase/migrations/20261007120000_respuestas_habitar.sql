-- Formulario "Conozcamos tu forma de habitar"
-- El público (rol anon) solo puede insertar respuestas y subir fotos. Leer, solo con la service role.

create table if not exists public.respuestas_habitar (
  id             uuid primary key default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  cliente_nombre text,
  cliente_zona   text,
  respuestas     jsonb not null,
  pdf_url        text,
  estado         text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'en proceso'))
);

create index if not exists respuestas_habitar_creado_en_idx on public.respuestas_habitar (creado_en desc);

alter table public.respuestas_habitar enable row level security;

revoke all on public.respuestas_habitar from anon, authenticated;
grant insert (id, cliente_nombre, cliente_zona, respuestas) on public.respuestas_habitar to anon, authenticated;

drop policy if exists "publico_inserta" on public.respuestas_habitar;
create policy "publico_inserta" on public.respuestas_habitar
  for insert to anon, authenticated
  with check (estado = 'nuevo' and pdf_url is null);

-- Storage: fotos del cliente (privado, solo subir) y PDFs de resumen (privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referencias', 'referencias', false, 5242880, array['image/jpeg']),
       ('resumenes',   'resumenes',   false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "publico_sube_referencias" on storage.objects;
create policy "publico_sube_referencias" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'referencias'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and storage.filename(name) ~ '^(referencias|conservar)-[0-9]{1,2}\.jpg$'
  );
