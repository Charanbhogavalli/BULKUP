import {
  calculateApplicableUnitPricePaise,
  getNextTierProgress,
  formatPaiseToINR,
  rupeesToPaise,
  CommitmentInputSchema,
  PricingTierSchema,
  isPoolCutoffPassed,
} from '../lib/pricing';
import { PricingTier } from '../types';

function runTests() {
  console.log('--- Starting ADOSX BulkBuy Automated Business Logic Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Sample tiers from prompt specification:
  // Retail: ₹1,000 (100,000 paise)
  // At 50 units: ₹850 (85,000 paise)
  // At 100 units: ₹700 (70,000 paise)
  const sampleTiers: PricingTier[] = [
    { minQuantity: 1, unitPricePaise: 100000 },
    { minQuantity: 50, unitPricePaise: 85000 },
    { minQuantity: 100, unitPricePaise: 70000 },
  ];
  const referencePricePaise = 100000;

  // Test 1: Price is correct below first threshold
  const priceBelow50 = calculateApplicableUnitPricePaise(25, sampleTiers, referencePricePaise, 'pool_wide');
  assert(priceBelow50 === 100000, 'Test 1: Below threshold (<50 units) receives Tier 1 price (₹1,000 / 100000 paise)');

  // Test 2: Price changes correctly at each tier boundary
  const priceAt49 = calculateApplicableUnitPricePaise(49, sampleTiers, referencePricePaise, 'pool_wide');
  const priceAt50 = calculateApplicableUnitPricePaise(50, sampleTiers, referencePricePaise, 'pool_wide');
  const priceAt99 = calculateApplicableUnitPricePaise(99, sampleTiers, referencePricePaise, 'pool_wide');
  const priceAt100 = calculateApplicableUnitPricePaise(100, sampleTiers, referencePricePaise, 'pool_wide');
  const priceAt150 = calculateApplicableUnitPricePaise(150, sampleTiers, referencePricePaise, 'pool_wide');

  assert(priceAt49 === 100000, 'Test 2a: At 49 units, price remains 100,000 paise');
  assert(priceAt50 === 85000, 'Test 2b: At exact tier 2 boundary (50 units), price unlocks to 85,000 paise');
  assert(priceAt99 === 85000, 'Test 2c: At 99 units, price remains 85,000 paise');
  assert(priceAt100 === 70000, 'Test 2d: At exact tier 3 boundary (100 units), price unlocks to 70,000 paise');
  assert(priceAt150 === 70000, 'Test 2e: At 150 units (>100), price remains at top unlocked tier 70,000 paise');

  // Test 3: Correct pricing policy applied (pool_wide vs marginal)
  // For marginal pricing:
  // First 49 units (1 to 49) = 49 * 100,000 = 4,900,000 paise
  // Next 50 units (50 to 99) = 1 unit at 85,000 = 85,000 paise
  // Total cost for 50 units = (49 * 100000) + (1 * 85000) = 4,985,000 paise
  // Average unit price = 4,985,000 / 50 = 99,700 paise (different from pool-wide which is 85,000 paise)
  const marginalPriceAt50 = calculateApplicableUnitPricePaise(50, sampleTiers, referencePricePaise, 'marginal');
  assert(
    marginalPriceAt50 === 99700 && marginalPriceAt50 !== priceAt50,
    'Test 3: Marginal pricing policy computes progressive bracket average rather than flat pool-wide tier'
  );

  // Test 4: Invalid quantities are rejected by Zod schema
  const invalidNegative = CommitmentInputSchema.safeParse({ poolId: 'p1', quantity: -5 });
  const invalidZero = CommitmentInputSchema.safeParse({ poolId: 'p1', quantity: 0 });
  const invalidDecimal = CommitmentInputSchema.safeParse({ poolId: 'p1', quantity: 12.5 });
  const validCommitment = CommitmentInputSchema.safeParse({ poolId: 'p1', quantity: 20 });

  assert(!invalidNegative.success, 'Test 4a: Negative quantity rejected by schema');
  assert(!invalidZero.success, 'Test 4b: Zero quantity rejected by schema');
  assert(!invalidDecimal.success, 'Test 4c: Floating decimal quantity rejected by schema');
  assert(validCommitment.success, 'Test 4d: Positive integer quantity successfully validated');

  // Test 5: Next tier progression logic
  const progressAt30 = getNextTierProgress(30, sampleTiers, referencePricePaise, 'pool_wide');
  assert(
    progressAt30.unitsNeededForNextTier === 20,
    'Test 5a: Progress at 30 units identifies exactly 20 units needed for 50 threshold'
  );
  assert(
    progressAt30.currentSavingsPercent === 0,
    'Test 5b: Savings percent at base tier is 0%'
  );

  const progressAt60 = getNextTierProgress(60, sampleTiers, referencePricePaise, 'pool_wide');
  assert(
    progressAt60.unitsNeededForNextTier === 40,
    'Test 5c: Progress at 60 units identifies 40 units needed for 100 threshold'
  );
  assert(
    progressAt60.currentSavingsPercent === 15,
    'Test 5d: Savings percent at 85,000 paise vs 100,000 paise is exact 15%'
  );

  // Test 6: Currency calculations remain exact in integer paise without floating point errors
  const amountPaise = 50 * 85000; // 4,250,000 paise
  const formatted = formatPaiseToINR(amountPaise);
  assert(formatted.includes('42,500'), `Test 6a: Currency formatting formats 4250000 paise as ${formatted}`);
  assert(rupeesToPaise(1250.75) === 125075, 'Test 6b: Conversion from ₹1,250.75 is exact 125075 paise');

  // Test 7: Cutoff time verification
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  assert(isPoolCutoffPassed(pastDate) === true, 'Test 7a: Past cutoff time correctly detected as passed');
  assert(isPoolCutoffPassed(futureDate) === false, 'Test 7b: Future cutoff time correctly detected as active');

  // Test 8: Tier schema validation requires positive unit prices and positive quantities
  const invalidTier = PricingTierSchema.safeParse({ minQuantity: 0, unitPricePaise: -100 });
  assert(!invalidTier.success, 'Test 8: Invalid pricing tier with non-positive values rejected');

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed out of ${passed + failed} total assertions.`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests();
