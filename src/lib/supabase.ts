import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ProjectManager = {
  id: string;
  name: string;
  created_at: string;
};

export type GeneralContractor = {
  id: string;
  name: string;
  aliases: string | null;
  project_award_probability: number | null;
  award_probability: number | null;
  hit_rate_dollar: number | null;
  est_relationship: number | null;
  total_bids: number | null;
  total_bids_submitted_raw: number | null;
  created_at: string;
};

export type Rating = {
  id: string;
  gc_id: string;
  pm_id: string;
  job_number: string;
  job_name: string | null;
  payment_timeline: number;
  co_approval_timeline: number;
  co_negotiations: number;
  contract_terms: number;
  conflict_mitigation: number;
  schedule_trade_stacking: number;
  schedule_accuracy: number;
  site_control: number;
  relationship: number;
  created_at: string;
};

export type RatingFormData = {
  job_number: string;
  job_name: string;
  gc_id: string;
  payment_timeline: number;
  co_approval_timeline: number;
  co_negotiations: number;
  contract_terms: number;
  conflict_mitigation: number;
  schedule_trade_stacking: number;
  schedule_accuracy: number;
  site_control: number;
  relationship: number;
};

export type GCDashboardRow = {
  id: string;
  name: string;
  project_award_probability: number | null;
  payment_timeline: number;
  co_approval_timeline: number;
  co_negotiations: number;
  contract_terms: number;
  conflict_mitigation: number;
  schedule_trade_stacking: number;
  schedule_accuracy: number;
  site_control: number;
  relationship: number;
  overall_score: number;
  rating_count: number;
};
