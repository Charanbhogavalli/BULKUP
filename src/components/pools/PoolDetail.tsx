import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Pool, Commitment } from '../../types';
import { useAuth } from '../../lib/auth-context';
import {
  formatPaiseToINR,
  getNextTierProgress,
  getTimeRemainingString,
  isPoolCutoffPassed,
  calculateApplicableUnitPricePaise,
} from '../../lib/pricing';
import { commitToPool, withdrawCommitment } from '../../lib/db-service';
import {
  ArrowLeft,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Minus,
  Plus,
  Truck,
  RotateCcw,
} from 'lucide-react';

interface PoolDetailProps {
  poolId: string;
  onBack: () => void;
}

export const PoolDetail: React.FC<PoolDetailProps> = ({ poolId, onBack }) => {
  const { currentUser, activeGarage } = useAuth();
  const [pool, setPool] = useState<Pool | null>(null);
  const [userCommitment, setUserCommitment] = useState<Commitment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Commitment form state
  const [quantity, setQuantity] = useState<number>(10);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Subscribe to Pool and User's Commitment in real time
  useEffect(() => {
    const poolRef = doc(db, 'pools', poolId);
    const unsubscribePool = onSnapshot(
      poolRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setPool({ id: docSnap.id, ...(docSnap.data() as Omit<Pool, 'id'>) });
        } else {
          setError('Pool not found');
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, `pools/${poolId}`);
      }
    );

    // Subscribe to existing commitment if garage is present
    let unsubscribeCommitment = () => {};
    const garageId = activeGarage?.id || currentUser?.garageId || 'garage_precision';
    const commitmentDocId = `${poolId}_${garageId}`;

    unsubscribeCommitment = onSnapshot(
      doc(db, 'commitments', commitmentDocId),
      (docSnap) => {
        if (docSnap.exists()) {
          const com = docSnap.data() as Commitment;
          setUserCommitment(com);
          if (com.status === 'active') {
            setQuantity(com.quantity);
          }
        } else {
          setUserCommitment(null);
        }
      },
      (err) => {
        console.warn('Commitment fetch notice:', err.message);
      }
    );

    return () => {
      unsubscribePool();
      unsubscribeCommitment();
    };
  }, [poolId, activeGarage, currentUser]);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#171C18] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-xs text-[#5A6258]">Loading pool details...</p>
      </div>
    );
  }

  if (!pool || error) {
    return (
      <div className="bg-white border border-[#E2E4DE] rounded-lg p-8 text-center space-y-4">
        <p className="text-sm text-red-600">{error || 'Pool not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#171C18] text-white rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Pools</span>
        </button>
      </div>
    );
  }

  const isCutoffPassed = isPoolCutoffPassed(pool.cutoffAt);
  const isOpen = pool.status === 'open' && !isCutoffPassed;
  const hasActiveCommitment = userCommitment?.status === 'active';

  const progress = getNextTierProgress(
    pool.committedQuantity,
    pool.tiers,
    pool.referencePricePaise || 100000,
    pool.pricingPolicy
  );

  // Preview calculations for the user's selected quantity:
  // If user changes quantity, what would be the tentative pool committed quantity?
  const prevCommitted = hasActiveCommitment ? userCommitment.quantity : 0;
  const previewDelta = quantity - prevCommitted;
  const tentativePoolQuantity = Math.max(0, pool.committedQuantity + previewDelta);
  const previewUnitPricePaise = calculateApplicableUnitPricePaise(
    tentativePoolQuantity,
    pool.tiers,
    pool.referencePricePaise || 100000,
    pool.pricingPolicy
  );
  const estimatedTotalPaise = quantity * previewUnitPricePaise;

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOpen) return;

    try {
      setSubmitting(true);
      setError(null);
      setActionSuccess(null);

      const garageId = activeGarage?.id || currentUser?.garageId || 'garage_precision';
      const garageName = activeGarage?.name || currentUser?.name || 'Registered Garage';
      const userId = currentUser?.uid || 'anonymous';

      await commitToPool({
        poolId: pool.id,
        garageId,
        garageName,
        userId,
        quantity,
      });

      setActionSuccess(
        hasActiveCommitment
          ? `Commitment successfully updated to ${quantity} units.`
          : `Successfully joined pool with ${quantity} units!`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!hasActiveCommitment || !isOpen) return;

    try {
      setSubmitting(true);
      setError(null);
      setActionSuccess(null);

      const garageId = activeGarage?.id || currentUser?.garageId || 'garage_precision';
      const userId = currentUser?.uid || 'anonymous';

      await withdrawCommitment({
        poolId: pool.id,
        garageId,
        userId,
      });

      setActionSuccess('Commitment successfully withdrawn.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5A6258] hover:text-[#171C18] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Demand Pools</span>
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-mono font-medium uppercase tracking-wider ${
              isOpen
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-stone-200 text-stone-800'
            }`}
          >
            {isCutoffPassed && pool.status === 'open' ? 'Cutoff Passed (Closed)' : pool.status}
          </span>
          <div className="flex items-center gap-1 text-xs text-[#5A6258]">
            <Clock className="w-3.5 h-3.5" />
            <span>{getTimeRemainingString(pool.cutoffAt)}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Part Specs, Tier Progress, Configured Tiers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-[#E2E4DE] rounded-lg p-6 space-y-4">
            <div>
              <div className="text-xs font-mono text-[#5A6258] uppercase">
                SKU: {pool.productSku || 'SKU-PENDING'} • {pool.pricingPolicy === 'marginal' ? 'Marginal Pricing' : 'Pool-Wide Wholesale'}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171C18] mt-1">
                {pool.productName}
              </h1>
            </div>

            {pool.vehicleCompatibility && (
              <div className="p-3 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-xs">
                <span className="font-semibold text-[#171C18]">Vehicle Compatibility: </span>
                <span className="text-[#5A6258]">{pool.vehicleCompatibility}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#5A6258] pt-2 border-t border-[#E2E4DE]">
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#171C18]" />
                <span>Supplier: <strong className="text-[#171C18]">{pool.supplierName || 'Apex Auto Components'}</strong></span>
              </div>
              <div>•</div>
              <div>
                Reference Retail: <span className="font-mono line-through">{formatPaiseToINR(pool.referencePricePaise || 100000)}</span>
              </div>
              <div>•</div>
              <div>
                Min Pool Target: <span className="font-mono font-semibold text-[#171C18]">{pool.minimumQuantity} units</span>
              </div>
            </div>
          </div>

          {/* Demand Progress & Unlocked Tier */}
          <div className="bg-white border border-[#E2E4DE] rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-mono uppercase text-[#5A6258] tracking-wider">Aggregate Pool Demand</h3>
                <div className="text-2xl font-mono font-bold text-[#171C18] mt-0.5">
                  {pool.committedQuantity} <span className="text-sm font-normal text-[#5A6258]">units committed</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-[#5A6258]">Current Applicable Unit:</span>
                <div className="text-xl font-mono font-bold text-[#171C18]">
                  {formatPaiseToINR(progress.currentUnitPricePaise)}
                </div>
                {progress.currentSavingsPercent > 0 && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Save {progress.currentSavingsPercent}% vs retail
                  </span>
                )}
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-[#5A6258]">
                <span>
                  {progress.nextTier ? (
                    <>
                      Need <strong className="text-[#171C18] font-mono">{progress.unitsNeededForNextTier} units</strong> to unlock next tier ({formatPaiseToINR(progress.nextTier.unitPricePaise)})
                    </>
                  ) : (
                    <strong className="text-emerald-700">Maximum discount tier reached!</strong>
                  )}
                </span>
                <span className="font-mono">{Math.round(progress.progressPercent)}% to next threshold</span>
              </div>
              <div className="w-full bg-[#E2E4DE] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#171C18] h-full transition-all duration-300"
                  style={{ width: `${progress.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Configured Price Tiers Table */}
          <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E4DE] flex items-center justify-between">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#171C18]">
                Configured Supplier Pricing Tiers
              </h3>
              <span className="text-xs text-[#5A6258]">
                Policy: <strong className="text-[#171C18] capitalize">{pool.pricingPolicy.replace('_', ' ')}</strong>
              </span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] font-mono uppercase">
                <tr>
                  <th className="py-2.5 px-6 font-medium">Quantity Bracket</th>
                  <th className="py-2.5 px-6 font-medium">Unit Price</th>
                  <th className="py-2.5 px-6 font-medium">Savings</th>
                  <th className="py-2.5 px-6 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {pool.tiers.map((tier, idx) => {
                  const isUnlocked = pool.committedQuantity >= tier.minQuantity;
                  const isCurrentActive =
                    isUnlocked &&
                    (idx === pool.tiers.length - 1 || pool.committedQuantity < pool.tiers[idx + 1].minQuantity);
                  const savingsPct = pool.referencePricePaise
                    ? Math.round(((pool.referencePricePaise - tier.unitPricePaise) / pool.referencePricePaise) * 100)
                    : 0;

                  return (
                    <tr
                      key={idx}
                      className={isCurrentActive ? 'bg-[#C8F169]/15 font-semibold text-[#171C18]' : ''}
                    >
                      <td className="py-3 px-6 font-mono">
                        {tier.minQuantity}{tier.maxQuantity ? ` – ${tier.maxQuantity}` : '+'} units
                      </td>
                      <td className="py-3 px-6 font-mono font-bold">
                        {formatPaiseToINR(tier.unitPricePaise)}
                      </td>
                      <td className="py-3 px-6 font-mono text-emerald-700">
                        {savingsPct > 0 ? `-${savingsPct}%` : 'Base'}
                      </td>
                      <td className="py-3 px-6 text-right">
                        {isCurrentActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#171C18] text-[#C8F169] font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            ACTIVE TIER
                          </span>
                        ) : isUnlocked ? (
                          <span className="text-[11px] text-[#5A6258] font-mono">Unlocked</span>
                        ) : (
                          <span className="text-[11px] text-[#5A6258] font-mono">Locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Commitment Card & Action Form */}
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E4DE] rounded-lg p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#171C18]">Garage Commitment</h3>
              <p className="text-xs text-[#5A6258] mt-0.5">
                Garage: <strong className="text-[#171C18]">{activeGarage?.name || 'Authorized Garage'}</strong>
              </p>
            </div>

            {hasActiveCommitment && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold text-emerald-900">
                  <span>Current Active Commitment:</span>
                  <span className="font-mono">{userCommitment.quantity} units</span>
                </div>
                <div className="text-[11px] text-emerald-700">
                  Last updated: {new Date(userCommitment.updatedAt).toLocaleDateString()}
                </div>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {isOpen ? (
              <form onSubmit={handleCommit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171C18] mb-1.5">
                    Quantity to Commit (Units)
                  </label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 5))}
                      className="w-10 h-10 flex items-center justify-center bg-[#F7F8F5] border border-[#E2E4DE] rounded-l text-[#171C18] hover:bg-[#E2E4DE]"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full h-10 text-center font-mono font-bold text-base border-y border-[#E2E4DE] text-[#171C18] focus:outline-none focus:ring-1 focus:ring-[#171C18]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 5)}
                      className="w-10 h-10 flex items-center justify-center bg-[#F7F8F5] border border-[#E2E4DE] rounded-r text-[#171C18] hover:bg-[#E2E4DE]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Live Estimated Breakdown */}
                <div className="p-3.5 bg-[#F7F8F5] border border-[#E2E4DE] rounded space-y-2 text-xs">
                  <div className="flex justify-between text-[#5A6258]">
                    <span>Committed Units:</span>
                    <span className="font-mono text-[#171C18]">{quantity}</span>
                  </div>
                  <div className="flex justify-between text-[#5A6258]">
                    <span>Expected Unit Price:</span>
                    <span className="font-mono text-[#171C18]">{formatPaiseToINR(previewUnitPricePaise)}</span>
                  </div>
                  <div className="border-t border-[#E2E4DE] pt-2 flex justify-between font-bold text-sm text-[#171C18]">
                    <span>Estimated Total:</span>
                    <span className="font-mono">{formatPaiseToINR(estimatedTotalPaise)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-[#171C18] text-white hover:bg-black font-semibold text-xs rounded transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Processing Commitment...'
                    : hasActiveCommitment
                    ? 'Update Commitment'
                    : 'Join Pool & Commit Quantity'}
                </button>

                {hasActiveCommitment && (
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={submitting}
                    className="w-full py-2 px-3 border border-[#E2E4DE] text-xs text-[#5A6258] hover:text-red-700 hover:border-red-300 rounded flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Withdraw Commitment</span>
                  </button>
                )}
              </form>
            ) : (
              <div className="p-4 bg-stone-100 rounded text-xs text-[#5A6258] space-y-2">
                <div className="font-semibold text-[#171C18]">This pool is no longer accepting commitments.</div>
                <p>
                  Cutoff deadline has passed or pool has been finalized. Final supplier reconciliation is in progress.
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-[#E2E4DE] text-[11px] text-[#5A6258] space-y-1">
              <div className="flex items-center gap-1 text-[#171C18] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#5A6258]" />
                <span>Procurement Notice</span>
              </div>
              <p>
                Estimated price can decrease as more garages join before the cutoff. Final prices are locked upon administrative reconciliation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
