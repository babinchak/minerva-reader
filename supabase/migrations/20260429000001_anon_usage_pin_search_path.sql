-- Pin search_path on anon-usage helper functions (advisor warning).
alter function public.check_and_increment_anon_request(text, date, integer)
  set search_path = public, pg_catalog;

alter function public.get_anon_daily_spend(date)
  set search_path = public, pg_catalog;
