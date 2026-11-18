export type Organization = {
  id: string;
  name: string;
  role: string;
  slug?: string;
  version?: number;
  paid_through?: string;
  entitlement_status?: string;
};
export type Me = { organizations: Organization[]; owner: boolean; mfa: boolean; email: string; operationalMfaRequired?: boolean };
export type Location = {
  id: string;
  name: string;
  city: string;
  address: string;
  primary_category?: string | null;
  brand_id: string | null;
  maps_url: string;
  cid: string | null;
  place_id: string | null;
  identity_status: string;
  source?: string;
  lat: number;
  lng: number;
};
export type Keyword = {
  id: string;
  term: string;
  cluster: string;
  kind: string;
  status: string;
  priority: string;
};
export type Grid = {
  id: string;
  spacing_m: number;
  points: { sequence: number; lat: number; lng: number }[];
};
export type Run = {
  id: string;
  status: string;
  created_at: string;
  is_demo: boolean;
  provider: string;
  estimated_cost: number;
  actual_cost: number;
  config_snapshot: { plannedTasks: number };
};
export type Rank = {
  id: string;
  status: string;
  position: number | null;
  delta: number | null;
  provider: string;
  observed_at: string;
  is_demo: boolean;
  result_depth: number;
  failure_reason?: string | null;
  query_snapshot: {
    term: string;
    kind: string;
    surface: string;
    lat: number;
    lng: number;
    cluster: string;
    point: number;
    language: string;
    device: string;
    algorithmVersion: string;
  };
};
export type Ranking = {
  latest: Rank[];
  history: Rank[];
  summary: {
    samples: number;
    verified: number;
    top1: number;
    top3: number;
    top5: number;
    top10: number;
    brandSamples: number;
  };
};
export type Report = { id: string; state: string; created_at: string; hash: string; text?: string };
