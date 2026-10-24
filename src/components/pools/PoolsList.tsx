import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Pool } from '../../types';
import {
  formatPaiseToINR,
  getNextTierProgress,
  getTimeRemainingString,
  isPoolCutoffPassed,
} from '../../lib/pricing';
import { Clock, ArrowRight, Layers, AlertCircle } from 'lucide-react';

interface PoolsListProps {
  onSelectPool: (poolId: string) => void;
}

export const PoolsList: React.FC<PoolsListProps> = ({ onSelectPool }) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'pools'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Pool[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...(doc.data() as Omit<Pool, 'id'>) });
        });
        setPools(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'pools');
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#171C18] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-xs text-[#5A6258]">Loading active demand pools...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span>Failed to synchronize pools: {error}</span>
      </div>
    );
  }

  // Active or open pools
  const activePools = pools.filter((p) => p.status === 'open');
  const otherPools = pools.filter((p) => p.status !== 'open');

  return (
    <div className="space-y-6">
      {/* Title & Explanatory Context */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171C18]">Demand Pools</h1>
        <p className="text-sm text-[#5A6258] mt-1">
          Aggregating spare-parts order volumes across independent garages to unlock supplier bulk-pricing tiers.
        </p>
      </div>

      {activePools.length === 0 ? (
        <div className="bg-white border border-[#E2E4DE] rounded-lg p-12 text-center">
          <Layers className="w-8 h-8 text-[#5A6258] mx-auto mb-3 opacity-60" />
          <h3 className="text-sm font-semibold text-[#171C18]">No active demand pools available</h3>
          <p className="text-xs text-[#5A6258] mt-1 max-w-sm mx-auto">
            New wholesale demand pools are scheduled by administrators. Check back shortly or view catalog parts.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-medium">Part & SKU</th>
                  <th className="py-3 px-4 font-medium">Committed Qty</th>
                  <th className="py-3 px-4 font-medium">Next Threshold</th>
                  <th className="py-3 px-4 font-medium">Current Unit Price</th>
                  <th className="py-3 px-4 font-medium">Cutoff Remaining</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {activePools.map((pool) => {
                  const progress = getNextTierProgress(
                    pool.committedQuantity,
                    pool.tiers,
                    pool.referencePricePaise || 100000,
                    pool.pricingPolicy
                  );
                  const isClosedByTime = isPoolCutoffPassed(pool.cutoffAt);

                  return (
                    <tr key={pool.id} className="hover:bg-[#F7F8F5]/50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-sm text-[#171C18]">
                          {pool.productName || 'Automotive Spare Part'}
                        </div>
                        <div className="text-[11px] font-mono text-[#5A6258] mt-0.5">
                          SKU: {pool.productSku || 'SKU-PENDING'}
                        </div>
                        {pool.vehicleCompatibility && (
                          <div className="text-[11px] text-[#5A6258] mt-0.5 line-clamp-1">
                            Fits: {pool.vehicleCompatibility}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 font-mono font-medium text-sm text-[#171C18]">
                        {pool.committedQuantity} units
                      </td>
                      <td className="py-4 px-4">
                        {progress.nextTier ? (
                          <div>
                            <div className="text-[11px] text-[#171C18] font-medium">
                              Need <strong className="font-mono">{progress.unitsNeededForNextTier}</strong> more to unlock{' '}
                              <span className="font-mono">{formatPaiseToINR(progress.nextTier.unitPricePaise)}</span>
                            </div>
                            <div className="w-32 bg-[#E2E4DE] h-1.5 rounded-full overflow-hidden mt-1.5">
                              <div
                                className="bg-[#171C18] h-full"
                                style={{ width: `${progress.progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#C8F169]/50 text-[#171C18]">
                            Max tier unlocked
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-mono font-bold text-sm text-[#171C18]">
                          {formatPaiseToINR(progress.currentUnitPricePaise)}
                        </div>
                        {pool.referencePricePaise && pool.referencePricePaise > progress.currentUnitPricePaise && (
                          <div className="text-[10px] text-[#5A6258] line-through font-mono">
                            Ref: {formatPaiseToINR(pool.referencePricePaise)}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-[#5A6258]">
                          <Clock className="w-3.5 h-3.5" />
                          <span className={isClosedByTime ? 'text-red-600 font-medium' : ''}>
                            {getTimeRemainingString(pool.cutoffAt)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectPool(pool.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#171C18] text-white hover:bg-black transition-colors"
                        >
                          <span>View pool</span>
                          <ArrowRight className="w-3 h-3 text-[#C8F169]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Rows */}
          <div className="md:hidden divide-y divide-[#E2E4DE]">
            {activePools.map((pool) => {
              const progress = getNextTierProgress(
                pool.committedQuantity,
                pool.tiers,
                pool.referencePricePaise || 100000,
                pool.pricingPolicy
              );

              return (
                <div key={pool.id} className="p-4 space-y-3">
                  <div>
                    <div className="font-semibold text-sm text-[#171C18]">{pool.productName}</div>
                    <div className="text-xs font-mono text-[#5A6258] mt-0.5">SKU: {pool.productSku}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-[#E2E4DE]">
                    <div>
                      <span className="text-[#5A6258]">Committed: </span>
                      <strong className="font-mono text-[#171C18]">{pool.committedQuantity} units</strong>
                    </div>
                    <div>
                      <span className="text-[#5A6258]">Current Unit: </span>
                      <strong className="font-mono text-[#171C18]">{formatPaiseToINR(progress.currentUnitPricePaise)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-[11px] text-[#5A6258]">
                      <Clock className="w-3 h-3" />
                      <span>{getTimeRemainingString(pool.cutoffAt)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectPool(pool.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-[#171C18] text-white"
                    >
                      <span>View pool</span>
                      <ArrowRight className="w-3 h-3 text-[#C8F169]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical / Finalized Pools Section if any exist */}
      {otherPools.length > 0 && (
        <div className="pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5A6258] mb-3">
            Concluded / Closed Pools
          </h2>
          <div className="bg-white border border-[#E2E4DE] rounded-lg divide-y divide-[#E2E4DE]">
            {otherPools.map((pool) => (
              <div key={pool.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#171C18]">{pool.productName}</div>
                  <div className="text-[11px] font-mono text-[#5A6258]">SKU: {pool.productSku}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize ${
                      pool.status === 'finalized'
                        ? 'bg-emerald-100 text-emerald-800'
                        : pool.status === 'closed'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {pool.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectPool(pool.id)}
                    className="text-xs font-medium text-[#171C18] underline hover:no-underline"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
