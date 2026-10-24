import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Commitment } from '../../types';
import { useAuth } from '../../lib/auth-context';
import { formatPaiseToINR, getTimeRemainingString } from '../../lib/pricing';
import { FileText, ArrowRight, ShieldCheck } from 'lucide-react';

interface MyOrdersProps {
  onSelectPool: (poolId: string) => void;
}

export const MyOrders: React.FC<MyOrdersProps> = ({ onSelectPool }) => {
  const { activeGarage, currentUser } = useAuth();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const garageId = activeGarage?.id || currentUser?.garageId || 'garage_precision';

  useEffect(() => {
    if (!garageId) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'commitments'), where('garageId', '==', garageId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Commitment[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...(doc.data() as Omit<Commitment, 'id'>) });
        });
        // Sort newest first
        items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setCommitments(items);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'commitments');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [garageId]);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#171C18] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-xs text-[#5A6258]">Loading your garage commitments & orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Garage Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171C18]">My Orders & Commitments</h1>
          <p className="text-sm text-[#5A6258] mt-1">
            Track commitments, dynamic tier pricing, and supplier purchase order references for{' '}
            <strong className="text-[#171C18]">{activeGarage?.name || 'Registered Garage'}</strong>.
          </p>
        </div>
      </div>

      {commitments.length === 0 ? (
        <div className="bg-white border border-[#E2E4DE] rounded-lg p-12 text-center">
          <FileText className="w-8 h-8 text-[#5A6258] mx-auto mb-3 opacity-60" />
          <h3 className="text-sm font-semibold text-[#171C18]">No order commitments found</h3>
          <p className="text-xs text-[#5A6258] mt-1 max-w-sm mx-auto">
            You haven't joined any demand pools yet. Visit the Demand Pools workspace to commit spare parts volume.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-medium">Part & SKU</th>
                  <th className="py-3 px-4 font-medium">Committed Qty</th>
                  <th className="py-3 px-4 font-medium">Applicable Unit Price</th>
                  <th className="py-3 px-4 font-medium">Estimated / Confirmed Total</th>
                  <th className="py-3 px-4 font-medium">Cutoff / PO Reference</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {commitments.map((com) => {
                  const isFinalized = com.poolStatus === 'finalized' || !!com.finalUnitPricePaise;
                  const unitPrice = com.finalUnitPricePaise || com.estimatedUnitPricePaise;
                  const totalAmountPaise = com.quantity * unitPrice;

                  return (
                    <tr key={com.id} className="hover:bg-[#F7F8F5]/50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-sm text-[#171C18]">
                          {com.productName || 'Automotive Spare Part'}
                        </div>
                        <div className="text-[11px] font-mono text-[#5A6258] mt-0.5">
                          SKU: {com.productSku || 'SKU-PENDING'}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono font-medium text-sm text-[#171C18]">
                        {com.quantity} units
                      </td>
                      <td className="py-4 px-4 font-mono">
                        <div className="font-bold text-sm text-[#171C18]">
                          {formatPaiseToINR(unitPrice)}
                        </div>
                        <span className="text-[10px] text-[#5A6258]">
                          {isFinalized ? 'Locked Final Price' : 'Estimated Dynamic Tier'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono">
                        <div className="font-bold text-sm text-[#171C18]">
                          {formatPaiseToINR(totalAmountPaise)}
                        </div>
                        <span className="text-[10px] text-[#5A6258]">
                          {isFinalized ? 'Confirmed Total' : 'Tentative Total'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs">
                        {com.poNumber ? (
                          <div className="flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{com.poNumber}</span>
                          </div>
                        ) : com.cutoffAt ? (
                          <span className="text-[#5A6258]">{getTimeRemainingString(com.cutoffAt)}</span>
                        ) : (
                          <span className="text-[#5A6258]">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-medium uppercase ${
                            com.status === 'withdrawn'
                              ? 'bg-stone-100 text-stone-600'
                              : isFinalized
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {com.status === 'withdrawn'
                            ? 'Withdrawn'
                            : isFinalized
                            ? 'Supplier Order Confirmed'
                            : 'Active Commitment'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectPool(com.poolId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-[#171C18] text-white hover:bg-black transition-colors"
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
        </div>
      )}
    </div>
  );
};
