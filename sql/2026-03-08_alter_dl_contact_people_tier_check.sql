alter table public.dl_contact_people
drop constraint if exists dl_contact_people_tier_check;

alter table public.dl_contact_people
add constraint dl_contact_people_tier_check
check (tier in (1, 5, 15, 50, 150, 500, 1500));