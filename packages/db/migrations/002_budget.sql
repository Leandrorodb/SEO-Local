-- Permite que SOMENTE o proprietario que executou a migration leia usage_ledger
-- para calcular o total agregado com SECURITY DEFINER, mesmo com FORCE RLS.
-- A role lrt_app nao recebe acesso global via esta policy.
DO $migration$
BEGIN
  EXECUTE format(
    'CREATE POLICY lrt_global_usage_definer ON public.usage_ledger FOR SELECT TO %I USING (true)',
    current_user
  );
END
$migration$;

CREATE FUNCTION lrt_global_usage() RETURNS TABLE(cost bigint,daily bigint) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
SELECT coalesce(sum(CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END),0)::bigint,
coalesce(sum(CASE WHEN created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END ELSE 0 END),0)::bigint
FROM public.usage_ledger WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;
REVOKE ALL ON FUNCTION lrt_global_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lrt_global_usage() TO lrt_app;
