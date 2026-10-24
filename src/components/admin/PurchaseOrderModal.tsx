import React from 'react';
import { PurchaseOrder } from '../../types';
import { formatPaiseToINR } from '../../lib/pricing';
import { Printer, X, ShieldCheck, Download, Truck } from 'lucide-react';

interface PurchaseOrderModalProps {
  order: PurchaseOrder;
  onClose: () => void;
  onUpdateStatus?: (status: PurchaseOrder['status']) => void;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  order,
  onClose,
  onUpdateStatus,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E2E4DE] rounded-lg max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Top Actions */}
        <div className="px-6 py-3.5 bg-[#171C18] text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-[#C8F169]">
              {order.poNumber}
            </span>
            <span className="text-xs text-stone-300">• B2B Supplier Purchase Order</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-white text-[#171C18] rounded hover:bg-stone-200 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable PO Document Canvas */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1 text-[#171C18] bg-white print:p-0">
          {/* Header & Logo */}
          <div className="flex justify-between items-start border-b border-[#E2E4DE] pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#171C18] text-[#C8F169] font-bold text-xs flex items-center justify-center rounded">
                  AX
                </div>
                <h1 className="text-xl font-bold tracking-tight">ADOSX BulkBuy</h1>
              </div>
              <p className="text-xs text-[#5A6258] mt-1">
                Centralized B2B Automotive Spare Parts Demand Aggregation Platform
              </p>
              <p className="text-[11px] font-mono text-[#5A6258]">
                GSTIN: 29AAACA0000A1Z5 • Peenya Industrial Area, Bengaluru, Karnataka
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs font-mono font-semibold uppercase text-[#5A6258]">
                OFFICIAL PURCHASE ORDER
              </div>
              <div className="text-2xl font-mono font-bold text-[#171C18] mt-0.5">
                {order.poNumber}
              </div>
              <div className="text-xs text-[#5A6258] mt-1">
                Issued Date: <strong className="font-mono text-[#171C18]">{new Date(order.createdAt).toLocaleDateString()}</strong>
              </div>
              <div className="mt-1.5">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider ${
                    order.status === 'fulfilled'
                      ? 'bg-emerald-100 text-emerald-800'
                      : order.status === 'supplier_confirmed'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  STATUS: {order.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Supplier & Delivery Coordinates */}
          <div className="grid grid-cols-2 gap-6 text-xs py-2">
            <div className="p-3.5 bg-[#F7F8F5] border border-[#E2E4DE] rounded">
              <div className="font-bold text-[#171C18] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#171C18]" />
                <span>Supplier / Vendor</span>
              </div>
              <div className="font-semibold text-sm text-[#171C18]">{order.supplierName}</div>
              <div className="text-[#5A6258] mt-0.5">Automotive Parts OEM / Tier 1 Distributor</div>
              <div className="font-mono text-[#5A6258] text-[11px] mt-1">Ref ID: {order.supplierId}</div>
            </div>

            <div className="p-3.5 bg-[#F7F8F5] border border-[#E2E4DE] rounded">
              <div className="font-bold text-[#171C18] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Demand Aggregation Summary</span>
              </div>
              <div className="text-[#5A6258]">Pool Reference: <strong className="font-mono text-[#171C18]">{order.poolId}</strong></div>
              <div className="text-[#5A6258] mt-0.5">Participating Garages: <strong className="font-mono text-[#171C18]">{order.lineItems?.length || 1} shops</strong></div>
              <div className="text-[#5A6258] mt-0.5">Total Aggregated Quantity: <strong className="font-mono text-[#171C18]">{order.aggregateQuantity} units</strong></div>
            </div>
          </div>

          {/* Master Item Row */}
          <div>
            <div className="text-xs font-mono font-semibold uppercase text-[#5A6258] mb-2">
              Procured Merchandise Line Items
            </div>
            <table className="w-full text-left text-xs border border-[#E2E4DE] rounded overflow-hidden">
              <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] font-mono uppercase">
                <tr>
                  <th className="py-2.5 px-3 font-medium">SKU</th>
                  <th className="py-2.5 px-3 font-medium">Item Description</th>
                  <th className="py-2.5 px-3 font-medium text-right">Aggregate Units</th>
                  <th className="py-2.5 px-3 font-medium text-right">Wholesale Unit Price</th>
                  <th className="py-2.5 px-3 font-medium text-right">Merchandise Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4DE]">
                <tr>
                  <td className="py-3 px-3 font-mono font-bold text-[#171C18]">{order.productSku}</td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#171C18]">{order.productName}</div>
                    <div className="text-[11px] text-[#5A6258]">Batch verified for aggregate demand pool</div>
                  </td>
                  <td className="py-3 px-3 font-mono font-semibold text-right">{order.aggregateQuantity}</td>
                  <td className="py-3 px-3 font-mono text-right">{formatPaiseToINR(order.applicableUnitPricePaise)}</td>
                  <td className="py-3 px-3 font-mono font-bold text-right text-base text-[#171C18]">
                    {formatPaiseToINR(order.totalAmountPaise)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Garage Breakdown Allocation */}
          {order.lineItems && order.lineItems.length > 0 && (
            <div>
              <div className="text-xs font-mono font-semibold uppercase text-[#5A6258] mb-2">
                Garage Order Allocation Breakdown
              </div>
              <table className="w-full text-left text-xs border border-[#E2E4DE]">
                <thead className="bg-[#F7F8F5] border-b border-[#E2E4DE] text-[#5A6258] font-mono uppercase">
                  <tr>
                    <th className="py-2 px-3">Garage Workshop</th>
                    <th className="py-2 px-3 font-mono">Garage Ref</th>
                    <th className="py-2 px-3 text-right">Allocation (Units)</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4DE]">
                  {order.lineItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-medium text-[#171C18]">{item.garageName}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-[#5A6258]">{item.garageId}</td>
                      <td className="py-2 px-3 font-mono text-right">{item.quantity}</td>
                      <td className="py-2 px-3 font-mono text-right">{formatPaiseToINR(item.subtotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legal / Terms */}
          <div className="border-t border-[#E2E4DE] pt-4 text-[11px] text-[#5A6258] space-y-1">
            <p className="font-semibold text-[#171C18]">Terms & Procurement Policy:</p>
            <p>1. Prices reflect locked supplier volume pricing tier unlocked by aggregated demand.</p>
            <p>2. Delivery coordinates and dispatch manifests will be provided upon supplier acceptance.</p>
            <p>3. All currency amounts are denominated in INR (Integer Paise Precision).</p>
          </div>
        </div>

        {/* Admin Status Transition Actions (Hidden on Print) */}
        {onUpdateStatus && (
          <div className="px-6 py-3 bg-[#F7F8F5] border-t border-[#E2E4DE] flex items-center justify-between print:hidden">
            <div className="text-xs text-[#5A6258]">
              Update Order Status:
            </div>
            <div className="flex items-center gap-2">
              {order.status === 'issued' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus('supplier_confirmed')}
                  className="px-3 py-1 text-xs font-semibold bg-[#171C18] text-white rounded hover:bg-black"
                >
                  Mark Supplier Confirmed
                </button>
              )}
              {order.status === 'supplier_confirmed' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus('fulfilled')}
                  className="px-3 py-1 text-xs font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800"
                >
                  Mark Order Fulfilled
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
