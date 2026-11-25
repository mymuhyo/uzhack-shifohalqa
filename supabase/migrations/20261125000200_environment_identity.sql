-- 20261125000200_environment_identity.sql
-- M1.2 Environment identity guard row for isolated shifohalqa-final preview DB.

CREATE TABLE IF NOT EXISTS public.environment_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  env_id text NOT NULL CHECK (env_id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.environment_identity (singleton, env_id, description)
VALUES (true, 'final-preview', 'Isolated ShifoHalqa Grand Final preview database (shifohalqa-final)')
ON CONFLICT (singleton) DO UPDATE
SET env_id = EXCLUDED.env_id,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

REVOKE ALL ON TABLE public.environment_identity FROM anon, authenticated;
ALTER TABLE public.environment_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS environment_identity_deny_authenticated ON public.environment_identity;
CREATE POLICY environment_identity_deny_authenticated
  ON public.environment_identity FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shifohalqa_telegram_service') THEN
    GRANT SELECT ON TABLE public.environment_identity TO shifohalqa_telegram_service;
  END IF;
END $$;
