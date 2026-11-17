-- A nullable expression can pass a SQL CHECK; verified results always need an actual rank.
ALTER TABLE rank_measurements ADD CONSTRAINT verified_position_present
  CHECK (status <> 'VERIFIED' OR (position IS NOT NULL AND position BETWEEN 1 AND result_depth
    AND NULLIF(btrim(identity_match), '') IS NOT NULL));
