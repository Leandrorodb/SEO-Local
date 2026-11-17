-- 1-point measurements for scripts-like quick local audits. Existing 5x5 grids remain valid.
ALTER TABLE search_grids DROP CONSTRAINT IF EXISTS search_grids_points_check;
ALTER TABLE search_grids ADD CONSTRAINT search_grids_points_check
  CHECK (jsonb_array_length(points) IN (1,25));
