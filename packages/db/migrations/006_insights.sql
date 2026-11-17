ALTER TABLE business_locations ADD COLUMN alert_rules jsonb NOT NULL DEFAULT '{}';
ALTER TABLE rank_measurements ADD CONSTRAINT measurement_location_ref UNIQUE(organization_id,location_id,id);
CREATE TABLE opportunity_actions (
 organization_id uuid NOT NULL, location_id uuid NOT NULL, measurement_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('IN_PROGRESS','DONE','DISMISSED')),
 changed_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,location_id,measurement_id),
 FOREIGN KEY(organization_id,location_id,measurement_id) REFERENCES rank_measurements(organization_id,location_id,id),
 FOREIGN KEY(organization_id,changed_by) REFERENCES organization_members(organization_id,user_id)
);
ALTER TABLE opportunity_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_opportunities ON opportunity_actions USING(organization_id=lrt_org()) WITH CHECK(organization_id=lrt_org());
GRANT SELECT,INSERT,UPDATE ON opportunity_actions TO lrt_app;
CREATE INDEX measurement_location_time ON rank_measurements(organization_id,location_id,observed_at DESC,id DESC);
