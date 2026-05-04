alter table public.dl_edges
drop constraint if exists dl_edges_tier_check;

alter table public.dl_edges
add constraint dl_edges_tier_check
check (tier in (1, 5, 15, 50, 150, 500, 1500));