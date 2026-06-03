import { supabase } from './supabase';

export type BidThresholds = {
  tier_2_min: number;
  tier_3_min: number;
  tier_4_min: number;
  tier_5_min: number;
};

export const DEFAULT_THRESHOLDS: BidThresholds = {
  tier_2_min: 1,
  tier_3_min: 1_000_000,
  tier_4_min: 5_000_000,
  tier_5_min: 10_000_000,
};

export function totalBidsToScore(dollars: number, t: BidThresholds): number {
  if (dollars <= 0) return 1;
  if (dollars < t.tier_2_min) return 1;
  if (dollars < t.tier_3_min) return 2;
  if (dollars < t.tier_4_min) return 3;
  if (dollars < t.tier_5_min) return 4;
  return 5;
}

export async function fetchThresholds(): Promise<BidThresholds> {
  const { data } = await supabase
    .from('bid_thresholds')
    .select('tier_2_min, tier_3_min, tier_4_min, tier_5_min')
    .eq('id', 1)
    .maybeSingle();
  return data ?? DEFAULT_THRESHOLDS;
}

export async function saveThresholds(t: BidThresholds): Promise<void> {
  await supabase
    .from('bid_thresholds')
    .upsert({ id: 1, ...t, updated_at: new Date().toISOString() });
}
