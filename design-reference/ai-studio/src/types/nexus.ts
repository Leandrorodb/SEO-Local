export type Priority = 'P1' | 'P2' | 'P3';

export type MeasurementStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'VERIFIED'
  | 'REVIEW'
  | 'NO_LIST'
  | 'NOT_FOUND'
  | 'BLOCKED'
  | 'FAILED'
  | 'ERROR'
  | 'REJECTED'
  | 'COMPLETE';

export type ConfidenceType = 'NONE' | 'CID' | 'NAME_ONLY' | 'CSV_ONLY' | 'HUMAN_REVIEW';

export interface Company {
  id: number;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  cid: string;
  maps_url: string;
  created_at?: string;
  term_count?: number;
  p1_count?: number;
  last_status?: MeasurementStatus | null;
  last_run_id?: number | null;
}

export interface Term {
  id: number;
  company_id: number;
  query: string;
  cluster: string;
  priority: Priority;
  created_at?: string;
}

export interface MeasurementCard {
  name: string;
  url: string;
  detail: string;
  promoted?: boolean;
}

export interface Measurement {
  id: number;
  run_id: number;
  term_id: number;
  query?: string;
  cluster?: string;
  priority?: Priority;
  status: MeasurementStatus;
  position: number | null;
  candidate_position: number | null;
  confidence: ConfidenceType;
  screenshot: string;
  search_url: string;
  results_json: MeasurementCard[];
  observed_count: number;
  measured_at: string | null;
  review_note: string;
  company_name?: string;
  city?: string;
  company_cid?: string;
}

export interface Run {
  id: number;
  company_id: number;
  company_name?: string;
  city?: string;
  status: MeasurementStatus;
  mode: 'priority' | 'all';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  total: number;
  completed: number;
  message: string;
  source?: 'LIVE' | 'IMPORT';
  measurements?: Measurement[];
}

export interface Summary {
  companies: number;
  terms: number;
  completed: number;
  measured: number;
  reviews: number;
  top1: number;
  top3: number;
  recent: Array<{
    id: number;
    status: MeasurementStatus;
    total: number;
    completed: number;
    created_at: string;
    source?: string;
    company_name: string;
  }>;
}

export interface FeedbackReport {
  company: Company;
  run: Run | null;
  verifiedCount: number;
  reviewCount: number;
  text: string;
}

export type ViewType =
  | 'overview'
  | 'companies'
  | 'terms'
  | 'measurements'
  | 'reviews'
  | 'reports'
  | 'import'
  | 'collector'
  | 'settings';
