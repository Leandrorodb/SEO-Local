-- Preserve the Maps primary category for reliable niche inference.
-- Null is meaningful: never invent a category for an unresolved listing.
ALTER TABLE business_locations ADD COLUMN IF NOT EXISTS primary_category text;
