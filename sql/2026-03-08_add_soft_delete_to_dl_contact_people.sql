alter table public.dl_contact_people
add column if not exists is_deleted boolean not null default false;

alter table public.dl_contact_people
add column if not exists deleted_at timestamptz null;

create index if not exists idx_dl_contact_people_owner_user_id_is_deleted
  on public.dl_contact_people(owner_user_id, is_deleted);

create index if not exists idx_dl_contact_people_is_deleted
  on public.dl_contact_people(is_deleted);