CREATE FUNCTION lrt_global_usage() RETURNS TABLE(cost bigint,daily bigint) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp SET "app.system"='true' AS $$
SELECT coalesce(sum(CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END),0)::bigint,
coalesce(sum(CASE WHEN created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END ELSE 0 END),0)::bigint
FROM usage_ledger WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;
REVOKE ALL ON FUNCTION lrt_global_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lrt_global_usage() TO lrt_app;
