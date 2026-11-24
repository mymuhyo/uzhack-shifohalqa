-- 20261124000600_realtime_publications.sql
-- Idempotently adds live clinical queue and patient update tables to supabase_realtime.

DO $$
DECLARE
  target_table text;
  realtime_tables text[] := ARRAY[
    'flags',
    'exercise_attempts',
    'urgent_symptoms',
    'task_instances',
    'flag_followups',
    'teach_back_attempts',
    'daily_step_counts'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH target_table IN ARRAY realtime_tables
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = target_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
      END IF;
    END LOOP;
  END IF;
END $$;
