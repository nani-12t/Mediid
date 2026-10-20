-- Phase 2.1 grants no business repository access. Administrator provisions named roles first.
BEGIN;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,mediid_runtime,mediid_diagnostics;
GRANT SELECT ON TABLE public._prisma_migrations TO mediid_runtime,mediid_diagnostics;
CREATE VIEW public.mediid_infrastructure_status AS
 SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::integer AS applied_migrations,
        count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::integer AS incomplete_migrations
 FROM public._prisma_migrations;
GRANT SELECT ON TABLE public.mediid_infrastructure_status TO mediid_runtime,mediid_diagnostics;
COMMIT;
