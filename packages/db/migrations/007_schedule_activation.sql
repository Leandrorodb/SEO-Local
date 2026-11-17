ALTER TABLE audit_schedules ADD COLUMN request_key text, ADD COLUMN request_hash text, ADD COLUMN initial_run_id uuid;
ALTER TABLE audit_schedules ADD UNIQUE (organization_id,created_by,request_key);
ALTER TABLE audit_schedules ADD FOREIGN KEY (organization_id,location_id,initial_run_id)
  REFERENCES audit_runs(organization_id,location_id,id);
