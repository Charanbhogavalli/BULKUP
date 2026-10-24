import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Product, Pool } from '../../types';
import { formatPaiseToINR } from '../../lib/pricing';
import { Search, ArrowRight, Package, Tag } from 'lucide-react';

interface PartsCatalogueProps {
  onSelectPool: (poolId: string) => void;
  onOpenCreatePoolModal?: (product: Product) => void;
}

export const PartsCatalogue: React.FC<PartsCatalogueProps> = ({ onSelectPool }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const items: Product[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...(doc.data() as Omit<Product, 'id'>) });
        });
        setProducts(items);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'products');
        setLoading(false);
      }
    );

    const unsubPools = onSnapshot(
      collection(db, 'pools'),
      (snapshot) => {
        const pItems: Pool[] = [];
        snapshot.forEach((doc) => {
          pItems.push({ id: doc.id, ...(doc.data() as Omit<Pool, 'id'>) });
        });
        setPools(pItems);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'pools');
      }
    );

    return () => {
      unsubProducts();
      unsubPools();
    };
  }, []);

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.vehicleCompatibility.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#171C18] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-xs text-[#5A6258]">Loading spare parts catalogue...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171C18]">Parts Catalogue</h1>
          <p className="text-sm text-[#5A6258] mt-1">
            Browse verified automotive spare parts eligible for bulk-buy aggregation.
          </p>
        </div>

        {/* Real search input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#5A6258] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by part name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#E2E4DE] rounded text-[#171C18] placeholder-[#5A6258] focus:outline-none focus:ring-1 focus:ring-[#171C18]"
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-[#E2E4DE] rounded-lg p-12 text-center">
          <Package className="w-8 h-8 text-[#5A6258] mx-auto mb-3 opacity-60" />
          <h3 className="text-sm font-semibold text-[#171C18]">No parts matching search</h3>
          <p className="text-xs text-[#5A6258] mt-1">
            Try searching with a different SKU or vehicle model keyword.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-medium">Part Number & SKU</th>
                  <th className="py-3 px-4 font-medium">Vehicle Compatibility</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Retail Ref Price</th>
                  <th className="py-3 px-4 font-medium">Active Demand Pool</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {filteredProducts.map((prod) => {
                  const activePool = pools.find(
                    (p) => p.productId === prod.id && p.status === 'open'
                  );

                  return (
                    <tr key={prod.id} className="hover:bg-[#F7F8F5]/50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-sm text-[#171C18]">{prod.name}</div>
                        <div className="text-[11px] font-mono text-[#5A6258] mt-0.5">
                          SKU: {prod.sku}
                        </div>
                      </td>
                      <td className="py-4 px-4 max-w-xs text-xs text-[#5A6258]">
                        {prod.vehicleCompatibility}
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-[#5A6258]">
                        <span className="inline-flex items-center gap-1 bg-[#F7F8F5] px-2 py-0.5 rounded border border-[#E2E4DE]">
                          <Tag className="w-3 h-3 text-[#5A6258]" />
                          <span>{prod.category}</span>
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-sm text-[#171C18]">
                        {formatPaiseToINR(prod.referencePricePaise)}
                      </td>
                      <td className="py-4 px-4">
                        {activePool ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="font-mono text-xs text-emerald-800 font-medium">
                              Active ({activePool.committedQuantity} units)
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#5A6258] font-mono">No active pool</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {activePool ? (
                          <button
                            type="button"
                            onClick={() => onSelectPool(activePool.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#171C18] text-white hover:bg-black transition-colors"
                          >
                            <span>Inspect pool</span>
                            <ArrowRight className="w-3 h-3 text-[#C8F169]" />
                          </button>
                        ) : (
                          <span className="text-xs text-[#5A6258] italic">Scheduled soon</span>
                        )}
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
