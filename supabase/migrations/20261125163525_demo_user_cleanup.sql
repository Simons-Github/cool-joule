-- Demo mode: anonymous users ("Demo ausprobieren") are deleted after 7 days.
-- All user tables reference auth.users with ON DELETE CASCADE, so their sample data goes too.
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'delete-stale-demo-users',
  '17 3 * * *',
  $$delete from auth.users where is_anonymous and created_at < now() - interval '7 days'$$
);
