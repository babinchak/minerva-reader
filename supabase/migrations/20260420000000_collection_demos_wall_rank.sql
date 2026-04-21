-- Add wall_rank for curating which demos appear on the landing-page response wall.
-- NULL = not featured on the wall. Non-null values are sorted ascending.

alter table public.collection_demos
  add column if not exists wall_rank integer;

create index if not exists idx_collection_demos_wall_rank
  on public.collection_demos(wall_rank)
  where wall_rank is not null;
