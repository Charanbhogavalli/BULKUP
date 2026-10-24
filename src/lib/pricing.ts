import { z } from 'zod';
import { PricingTier, PricingPolicy } from '../types';

/**
 * Zod validation schemas
 */
export const CommitmentInputSchema = z.object({
  poolId: z.string().min(1, 'Pool ID is required').max(128),
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
});

export const PricingTierSchema = z.object({
  minQuantity: z.number().int().positive('Minimum quantity must be at least 1'),
  maxQuantity: z.number().int().positive().nullable().optional(),
  unitPricePaise: z.number().int().positive('Price must be greater than 0'),
});

export const PoolInputSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  pricingPolicy: z.enum(['pool_wide', 'marginal']),
  minimumQuantity: z.number().int().positive('Minimum pool quantity must be positive'),
  targetQuantity: z.number().int().positive('Target quantity must be positive'),
  cutoffAt: z.string().min(1, 'Cutoff date is required'),
  tiers: z.array(PricingTierSchema).min(1, 'At least one pricing tier is required'),
});

/**
 * Formats integer paise into standard Indian Rupee string (e.g. ₹1,000.00)
 */
export function formatPaiseToINR(paise: number): string {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0.00';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Formats integer paise into compact Indian Rupee string without decimals if whole (e.g. ₹1,000)
 */
export function formatPaiseToINRCompact(paise: number): string {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0';
  const rupees = Math.round(paise / 100);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

/**
 * Converts rupee string/number to integer paise safely
 */
export function rupeesToPaise(rupees: number | string): number {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/**
 * Calculates the applicable unit price for an aggregate pool quantity based on policy.
 * 
 * - pool_wide: All units get the tier price corresponding to the highest unlocked threshold.
 * - marginal: Units in each bracket get that bracket's price; returns effective average price per unit.
 */
export function calculateApplicableUnitPricePaise(
  aggregateQuantity: number,
  tiers: PricingTier[],
  referencePricePaise: number,
  policy: PricingPolicy = 'pool_wide'
): number {
  if (!tiers || tiers.length === 0 || aggregateQuantity <= 0) {
    return referencePricePaise;
  }

  // Ensure tiers are sorted ascending by minQuantity
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

  if (policy === 'pool_wide') {
    // Find the highest tier where aggregateQuantity >= minQuantity
    let applicablePrice = referencePricePaise;
    for (const tier of sortedTiers) {
      if (aggregateQuantity >= tier.minQuantity) {
        applicablePrice = tier.unitPricePaise;
      } else {
        break;
      }
    }
    return applicablePrice;
  }

  if (policy === 'marginal') {
    // Calculate total cost incrementally across brackets
    let remaining = aggregateQuantity;
    let totalCostPaise = 0;

    for (let i = 0; i < sortedTiers.length; i++) {
      const currentTier = sortedTiers[i];
      const nextTier = sortedTiers[i + 1];

      // Bracket size is nextTier.minQuantity - currentTier.minQuantity (or unbounded for last tier)
      const bracketCapacity = nextTier 
        ? nextTier.minQuantity - currentTier.minQuantity 
        : Infinity;

      const unitsInThisBracket = Math.min(remaining, bracketCapacity);
      if (unitsInThisBracket > 0) {
        totalCostPaise += unitsInThisBracket * currentTier.unitPricePaise;
        remaining -= unitsInThisBracket;
      }

      if (remaining <= 0) break;
    }

    // Effective average price per unit
    return Math.round(totalCostPaise / aggregateQuantity);
  }

  return referencePricePaise;
}

export interface NextTierProgress {
  currentTierIndex: number;
  currentTier: PricingTier | null;
  nextTier: PricingTier | null;
  unitsNeededForNextTier: number;
  progressPercent: number;
  currentUnitPricePaise: number;
  nextUnitPricePaise: number | null;
  currentSavingsPercent: number;
}

/**
 * Analyzes progress toward unlocking the next discount tier
 */
export function getNextTierProgress(
  aggregateQuantity: number,
  tiers: PricingTier[],
  referencePricePaise: number,
  policy: PricingPolicy = 'pool_wide'
): NextTierProgress {
  if (!tiers || tiers.length === 0) {
    return {
      currentTierIndex: -1,
      currentTier: null,
      nextTier: null,
      unitsNeededForNextTier: 0,
      progressPercent: 0,
      currentUnitPricePaise: referencePricePaise,
      nextUnitPricePaise: null,
      currentSavingsPercent: 0,
    };
  }

  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  let currentTierIndex = -1;
  let currentTier: PricingTier | null = null;
  let nextTier: PricingTier | null = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    if (aggregateQuantity >= sortedTiers[i].minQuantity) {
      currentTierIndex = i;
      currentTier = sortedTiers[i];
    } else {
      nextTier = sortedTiers[i];
      break;
    }
  }

  const currentUnitPricePaise = calculateApplicableUnitPricePaise(
    aggregateQuantity,
    sortedTiers,
    referencePricePaise,
    policy
  );

  let unitsNeededForNextTier = 0;
  let progressPercent = 0;

  if (nextTier) {
    unitsNeededForNextTier = Math.max(0, nextTier.minQuantity - aggregateQuantity);
    const prevThreshold = currentTier ? currentTier.minQuantity : 0;
    const range = nextTier.minQuantity - prevThreshold;
    const progressInRange = aggregateQuantity - prevThreshold;
    progressPercent = range > 0 ? Math.min(100, Math.max(0, (progressInRange / range) * 100)) : 0;
  } else {
    // Top tier reached
    progressPercent = 100;
  }

  const currentSavingsPercent = referencePricePaise > 0 
    ? Math.max(0, Math.round(((referencePricePaise - currentUnitPricePaise) / referencePricePaise) * 100))
    : 0;

  return {
    currentTierIndex,
    currentTier,
    nextTier,
    unitsNeededForNextTier,
    progressPercent,
    currentUnitPricePaise,
    nextUnitPricePaise: nextTier ? nextTier.unitPricePaise : null,
    currentSavingsPercent,
  };
}

/**
 * Checks whether a pool's cutoff time has passed
 */
export function isPoolCutoffPassed(cutoffAtIso: string): boolean {
  if (!cutoffAtIso) return false;
  const cutoff = new Date(cutoffAtIso).getTime();
  const now = Date.now();
  return now >= cutoff;
}

/**
 * Computes human-readable remaining time until cutoff
 */
export function getTimeRemainingString(cutoffAtIso: string): string {
  if (!cutoffAtIso) return 'No cutoff set';
  const cutoff = new Date(cutoffAtIso).getTime();
  const diffMs = cutoff - Date.now();

  if (diffMs <= 0) return 'Cutoff passed (Closed)';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  if (diffDays > 0) {
    return `${diffDays}d ${remainingHours}h remaining`;
  }
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${diffHours}h ${diffMinutes}m remaining`;
}
