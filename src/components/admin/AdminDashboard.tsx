import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  Product,
  Supplier,
  Pool,
  PurchaseOrder,
  PricingTier,
  PricingPolicy,
} from '../../types';
import { useAuth } from '../../lib/auth-context';
import {
  formatPaiseToINR,
  rupeesToPaise,
} from '../../lib/pricing';
import {
  closePool,
  cancelPool,
  finalizePoolAndGeneratePO,
  updatePurchaseOrderStatus,
  createDemandPool,
  saveProduct,
} from '../../lib/db-service';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import {
  Wrench,
  Package,
  Layers,
  FileCheck,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { currentUser, seedDatabase } = useAuth();
  const [activeTab, setActiveTab] = useState<'pools' | 'products' | 'orders'>('pools');

  const [pools, setPools] = useState<Pool[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selected PO for Modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // UI state
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal / Form state for Creating Pool
  const [showCreatePoolModal, setShowCreatePoolModal] = useState<boolean>(false);
  const [newPoolProductId, setNewPoolProductId] = useState<string>('');
  const [newPoolSupplierId, setNewPoolSupplierId] = useState<string>('');
  const [newPoolPolicy, setNewPoolPolicy] = useState<PricingPolicy>('pool_wide');
  const [newPoolMinQty, setNewPoolMinQty] = useState<number>(30);
  const [newPoolTargetQty, setNewPoolTargetQty] = useState<number>(100);
  const [newPoolDaysAhead, setNewPoolDaysAhead] = useState<number>(7);
  const [newPoolTiers, setNewPoolTiers] = useState<PricingTier[]>([
    { minQuantity: 1, maxQuantity: 29, unitPricePaise: 100000 },
    { minQuantity: 30, maxQuantity: 74, unitPricePaise: 85000 },
    { minQuantity: 75, maxQuantity: null, unitPricePaise: 70000 },
  ]);

  // Modal / Form state for Creating Product
  const [showCreateProductModal, setShowCreateProductModal] = useState<boolean>(false);
  const [newProductName, setNewProductName] = useState<string>('');
  const [newProductSku, setNewProductSku] = useState<string>('');
  const [newProductCompat, setNewProductCompat] = useState<string>('');
  const [newProductCategory, setNewProductCategory] = useState<string>('Suspension & Steering');
  const [newProductPriceRupees, setNewProductPriceRupees] = useState<number>(2500);

  // Real-time synchronization of pools, products, suppliers, and purchase orders
  useEffect(() => {
    const unsubPools = onSnapshot(collection(db, 'pools'), (snap) => {
      const items: Pool[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<Pool, 'id'>) }));
      setPools(items);
      setLoading(false);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const items: Product[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
      setProducts(items);
      if (items.length > 0 && !newPoolProductId) {
        setNewPoolProductId(items[0].id);
        setNewPoolSupplierId(items[0].supplierId || 'sup_apex');
      }
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      const items: Supplier[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<Supplier, 'id'>) }));
      setSuppliers(items);
    });

    const unsubPOs = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
      const items: PurchaseOrder[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<PurchaseOrder, 'id'>) }));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPurchaseOrders(items);
    });

    return () => {
      unsubPools();
      unsubProducts();
      unsubSuppliers();
      unsubPOs();
    };
  }, []);

  const handleFinalizePool = async (pool: Pool) => {
    try {
      setProcessingId(pool.id);
      setActionMessage(null);
      const po = await finalizePoolAndGeneratePO({
        poolId: pool.id,
        adminUid: currentUser?.uid || 'admin',
      });
      setActionMessage({
        type: 'success',
        text: `Pool finalized successfully! Official Purchase Order generated: ${po.poNumber}.`,
      });
      setSelectedPO(po);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleClosePool = async (poolId: string) => {
    try {
      setProcessingId(poolId);
      await closePool(poolId);
      setActionMessage({ type: 'success', text: 'Pool status set to Closed.' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelPool = async (poolId: string) => {
    try {
      setProcessingId(poolId);
      await cancelPool(poolId);
      setActionMessage({ type: 'success', text: 'Pool cancelled.' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreatePoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedProduct = products.find((p) => p.id === newPoolProductId);
      const selectedSupplier = suppliers.find((s) => s.id === newPoolSupplierId) || suppliers[0];

      const cutoffAt = new Date(Date.now() + newPoolDaysAhead * 24 * 60 * 60 * 1000).toISOString();

      await createDemandPool({
        productId: newPoolProductId,
        supplierId: newPoolSupplierId || selectedProduct?.supplierId || 'sup_apex',
        pricingPolicy: newPoolPolicy,
        tiers: newPoolTiers,
        minimumQuantity: newPoolMinQty,
        targetQuantity: newPoolTargetQty,
        cutoffAt,
        status: 'open',
        createdBy: currentUser?.uid || 'admin',
        productName: selectedProduct?.name,
        productSku: selectedProduct?.sku,
        vehicleCompatibility: selectedProduct?.vehicleCompatibility,
        supplierName: selectedSupplier?.name,
        referencePricePaise: selectedProduct?.referencePricePaise,
      });

      setShowCreatePoolModal(false);
      setActionMessage({ type: 'success', text: 'New demand pool configured and opened for garage commitments!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = `prod_${Date.now()}`;
      await saveProduct({
        id,
        name: newProductName,
        sku: newProductSku.toUpperCase(),
        description: `Verified OEM spare part for ${newProductCompat}.`,
        category: newProductCategory,
        vehicleCompatibility: newProductCompat,
        referencePricePaise: rupeesToPaise(newProductPriceRupees),
        supplierId: suppliers[0]?.id || 'sup_apex',
        status: 'active',
      });

      setShowCreateProductModal(false);
      setNewProductName('');
      setNewProductSku('');
      setNewProductCompat('');
      setActionMessage({ type: 'success', text: 'Product successfully added to catalogue.' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#171C18] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-xs text-[#5A6258]">Loading administration workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171C18]">
              Procurement Administration
            </h1>
            <span className="text-[11px] bg-[#C8F169] text-[#171C18] font-mono font-bold px-2 py-0.5 rounded">
              VERIFIED
            </span>
          </div>
          <p className="text-sm text-[#5A6258] mt-1">
            Manage demand pools, configure discount thresholds, reconcile orders, and issue supplier purchase orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreatePoolModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#171C18] text-white hover:bg-black rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#C8F169]" />
            <span>New Demand Pool</span>
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded text-xs flex items-center justify-between gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-[#5A6258] hover:text-[#171C18] font-bold text-sm px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Admin Sub-Tabs */}
      <div className="flex space-x-2 border-b border-[#E2E4DE] pb-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('pools')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'pools' ? 'bg-[#171C18] text-white' : 'text-[#5A6258] hover:text-[#171C18]'
          }`}
        >
          Demand Pools ({pools.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'products' ? 'bg-[#171C18] text-white' : 'text-[#5A6258] hover:text-[#171C18]'
          }`}
        >
          Products & Suppliers ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-3 py-1.5 rounded transition-colors ${
            activeTab === 'orders' ? 'bg-[#171C18] text-white' : 'text-[#5A6258] hover:text-[#171C18]'
          }`}
        >
          Purchase Orders ({purchaseOrders.length})
        </button>
      </div>

      {/* Tab 1: Demand Pools Management */}
      {activeTab === 'pools' && (
        <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-medium">Pool / Part</th>
                  <th className="py-3 px-4 font-medium">Policy</th>
                  <th className="py-3 px-4 font-medium">Committed / Min</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Cutoff</th>
                  <th className="py-3 px-4 font-medium text-right">Operational Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {pools.map((pool) => {
                  const isEligibleForFinalization =
                    pool.status !== 'finalized' &&
                    pool.status !== 'cancelled' &&
                    pool.committedQuantity >= pool.minimumQuantity;

                  return (
                    <tr key={pool.id} className="hover:bg-[#F7F8F5]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-sm text-[#171C18]">{pool.productName}</div>
                        <div className="text-[11px] font-mono text-[#5A6258] mt-0.5">
                          SKU: {pool.productSku} • Ref ID: {pool.id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono capitalize">
                        {pool.pricingPolicy.replace('_', ' ')}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-bold text-[#171C18]">{pool.committedQuantity}</span>
                        <span className="text-[#5A6258]"> / {pool.minimumQuantity} units</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-medium uppercase ${
                            pool.status === 'finalized'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pool.status === 'open'
                              ? 'bg-blue-100 text-blue-800'
                              : pool.status === 'closed'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {pool.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-[#5A6258]">
                        {new Date(pool.cutoffAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {pool.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => handleClosePool(pool.id)}
                              disabled={processingId === pool.id}
                              className="px-2 py-1 text-[11px] font-medium border border-[#E2E4DE] text-[#5A6258] hover:text-[#171C18] rounded"
                            >
                              Close Pool
                            </button>
                          )}

                          {isEligibleForFinalization && (
                            <button
                              type="button"
                              onClick={() => handleFinalizePool(pool)}
                              disabled={processingId === pool.id}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-[#171C18] text-[#C8F169] rounded hover:bg-black transition-colors"
                              title="Reconcile demand and issue official Purchase Order to supplier"
                            >
                              {processingId === pool.id ? 'Processing...' : 'Finalize & Issue PO'}
                            </button>
                          )}

                          {pool.status === 'finalized' && (
                            <button
                              type="button"
                              onClick={() => {
                                const po = purchaseOrders.find((p) => p.poolId === pool.id);
                                if (po) setSelectedPO(po);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded"
                            >
                              <span>View PO</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}

                          {pool.status !== 'cancelled' && pool.status !== 'finalized' && (
                            <button
                              type="button"
                              onClick={() => handleCancelPool(pool.id)}
                              disabled={processingId === pool.id}
                              className="px-2 py-1 text-[11px] text-stone-400 hover:text-red-600"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Products Catalogue Management */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreateProductModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#171C18] text-white rounded"
            >
              <Plus className="w-3.5 h-3.5 text-[#C8F169]" />
              <span>Add New Spare Part</span>
            </button>
          </div>

          <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] font-mono uppercase">
                <tr>
                  <th className="py-3 px-4 font-medium">Part Name</th>
                  <th className="py-3 px-4 font-medium">SKU</th>
                  <th className="py-3 px-4 font-medium">Compatibility</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Retail Ref Price</th>
                  <th className="py-3 px-4 font-medium">Supplier Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-medium text-[#171C18]">{p.name}</td>
                    <td className="py-3 px-4 font-mono font-bold text-[#171C18]">{p.sku}</td>
                    <td className="py-3 px-4 text-[#5A6258]">{p.vehicleCompatibility}</td>
                    <td className="py-3 px-4 font-mono text-[#5A6258]">{p.category}</td>
                    <td className="py-3 px-4 font-mono font-bold">{formatPaiseToINR(p.referencePricePaise)}</td>
                    <td className="py-3 px-4 font-mono text-[#5A6258]">{p.supplierId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Purchase Orders Issued */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-[#E2E4DE] rounded-lg overflow-hidden shadow-xs">
          {purchaseOrders.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#5A6258]">
              No purchase orders generated yet. Finalize an eligible demand pool to issue purchase orders.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] font-mono uppercase">
                <tr>
                  <th className="py-3 px-4 font-medium">PO Reference</th>
                  <th className="py-3 px-4 font-medium">Supplier</th>
                  <th className="py-3 px-4 font-medium">Product SKU</th>
                  <th className="py-3 px-4 font-medium">Aggregate Qty</th>
                  <th className="py-3 px-4 font-medium">Locked Unit Price</th>
                  <th className="py-3 px-4 font-medium">Total Amount</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-[#F7F8F5]/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-sm text-[#171C18]">{po.poNumber}</td>
                    <td className="py-3.5 px-4 text-[#171C18] font-medium">{po.supplierName}</td>
                    <td className="py-3.5 px-4 font-mono text-[#5A6258]">{po.productSku}</td>
                    <td className="py-3.5 px-4 font-mono font-bold">{po.aggregateQuantity} units</td>
                    <td className="py-3.5 px-4 font-mono">{formatPaiseToINR(po.applicableUnitPricePaise)}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-sm text-[#171C18]">
                      {formatPaiseToINR(po.totalAmountPaise)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                          po.status === 'fulfilled'
                            ? 'bg-emerald-100 text-emerald-800'
                            : po.status === 'supplier_confirmed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {po.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedPO(po)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[#171C18] text-white hover:bg-black rounded transition-colors"
                      >
                        <span>Inspect PO</span>
                        <ExternalLink className="w-3 h-3 text-[#C8F169]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Create Demand Pool */}
      {showCreatePoolModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E4DE] rounded-lg max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E4DE] pb-3">
              <h2 className="text-base font-bold text-[#171C18]">Configure New Demand Pool</h2>
              <button
                type="button"
                onClick={() => setShowCreatePoolModal(false)}
                className="text-stone-400 hover:text-[#171C18] text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePoolSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#171C18] mb-1">Target Spare Part SKU</label>
                <select
                  value={newPoolProductId}
                  onChange={(e) => {
                    setNewPoolProductId(e.target.value);
                    const prod = products.find((p) => p.id === e.target.value);
                    if (prod) setNewPoolSupplierId(prod.supplierId);
                  }}
                  className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — Ref: {formatPaiseToINR(p.referencePricePaise)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">Pricing Policy</label>
                  <select
                    value={newPoolPolicy}
                    onChange={(e) => setNewPoolPolicy(e.target.value as PricingPolicy)}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                  >
                    <option value="pool_wide">Pool-Wide (All get final tier price)</option>
                    <option value="marginal">Marginal (Bracket progressive)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">Cutoff Duration</label>
                  <select
                    value={newPoolDaysAhead}
                    onChange={(e) => setNewPoolDaysAhead(parseInt(e.target.value))}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                  >
                    <option value={3}>3 Days from now</option>
                    <option value={5}>5 Days from now</option>
                    <option value={7}>7 Days from now</option>
                    <option value={14}>14 Days from now</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">Minimum Order Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={newPoolMinQty}
                    onChange={(e) => setNewPoolMinQty(parseInt(e.target.value) || 1)}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">Target Pool Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={newPoolTargetQty}
                    onChange={(e) => setNewPoolTargetQty(parseInt(e.target.value) || 1)}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18] font-mono"
                  />
                </div>
              </div>

              {/* Configured Tiers Display */}
              <div>
                <label className="block font-semibold text-[#171C18] mb-1">
                  Configured Supplier Discount Tiers
                </label>
                <div className="bg-[#F7F8F5] border border-[#E2E4DE] rounded p-2.5 space-y-2">
                  {newPoolTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs font-mono">
                      <span>Tier {idx + 1}: {tier.minQuantity}{tier.maxQuantity ? `–${tier.maxQuantity}` : '+'} units</span>
                      <span className="font-bold">{formatPaiseToINR(tier.unitPricePaise)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E4DE]">
                <button
                  type="button"
                  onClick={() => setShowCreatePoolModal(false)}
                  className="px-3 py-1.5 border border-[#E2E4DE] text-[#5A6258] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#171C18] text-white font-semibold rounded hover:bg-black"
                >
                  Launch Demand Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Spare Part Product */}
      {showCreateProductModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E4DE] rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E4DE] pb-3">
              <h2 className="text-base font-bold text-[#171C18]">Add Spare Part SKU</h2>
              <button
                type="button"
                onClick={() => setShowCreateProductModal(false)}
                className="text-stone-400 hover:text-[#171C18] text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateProductSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#171C18] mb-1">Part Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monroe Front Shock Absorber Strut"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">SKU Number</label>
                  <input
                    type="text"
                    required
                    placeholder="MNR-SA-4410"
                    value={newProductSku}
                    onChange={(e) => setNewProductSku(e.target.value)}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#171C18] mb-1">Retail Ref Price (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newProductPriceRupees}
                    onChange={(e) => setNewProductPriceRupees(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#171C18] mb-1">Vehicle Compatibility</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hyundai Creta (2015-2020), Kia Seltos"
                  value={newProductCompat}
                  onChange={(e) => setNewProductCompat(e.target.value)}
                  className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#171C18] mb-1">Category</label>
                <select
                  value={newProductCategory}
                  onChange={(e) => setNewProductCategory(e.target.value)}
                  className="w-full p-2 bg-[#F7F8F5] border border-[#E2E4DE] rounded text-[#171C18]"
                >
                  <option value="Braking System">Braking System</option>
                  <option value="Suspension & Steering">Suspension & Steering</option>
                  <option value="Transmission & Clutch">Transmission & Clutch</option>
                  <option value="Electrical & Lighting">Electrical & Lighting</option>
                  <option value="Engine & Filtration">Engine & Filtration</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E4DE]">
                <button
                  type="button"
                  onClick={() => setShowCreateProductModal(false)}
                  className="px-3 py-1.5 border border-[#E2E4DE] text-[#5A6258] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#171C18] text-white font-semibold rounded hover:bg-black"
                >
                  Save Spare Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO View & Print Modal */}
      {selectedPO && (
        <PurchaseOrderModal
          order={selectedPO}
          onClose={() => setSelectedPO(null)}
          onUpdateStatus={async (newStatus) => {
            await updatePurchaseOrderStatus(selectedPO.id, newStatus);
            setSelectedPO({ ...selectedPO, status: newStatus });
            setActionMessage({
              type: 'success',
              text: `Purchase Order ${selectedPO.poNumber} status updated to '${newStatus}'.`,
            });
          }}
        />
      )}
    </div>
  );
};
