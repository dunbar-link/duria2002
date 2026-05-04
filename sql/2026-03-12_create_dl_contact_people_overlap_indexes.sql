create index if not exists idx_dl_contact_people_owner_active
on public.dl_contact_people (owner_user_id, is_deleted);

create index if not exists idx_dl_contact_people_name
on public.dl_contact_people (name);

create index if not exists idx_dl_contact_people_school
on public.dl_contact_people (school);

create index if not exists idx_dl_contact_people_company
on public.dl_contact_people (company);

create index if not exists idx_dl_contact_people_city
on public.dl_contact_people (city);