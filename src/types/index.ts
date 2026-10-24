export type UserRole = 'admin' | 'garage';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  garageId?: string;
  createdAt: string;
}

export interface Garage {
  id: string;
  name: string;
  ownerUid: string;
  phone: string;
  address: string;
  city: string;
  gstNumber?: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'inactive';
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  vehicleCompatibility: string;
  referencePricePaise: number; // e.g. 100000 = ₹1,000.00
  supplierId: string;
  status: 'active' | 'discontinued';
}

export interface PricingTier {
  minQuantity: number;
  maxQuantity?: number | null; // null for highest unbounded tier
  unitPricePaise: number;
}

export type PricingPolicy = 'pool_wide' | 'marginal';

export type PoolStatus = 'open' | 'closed' | 'finalized' | 'cancelled';

export interface Pool {
  id: string;
  productId: string;
  supplierId: string;
  pricingPolicy: PricingPolicy;
  tiers: PricingTier[];
  minimumQuantity: number;
  targetQuantity: number;
  committedQuantity: number;
  cutoffAt: string; // ISO 8601 string
  status: PoolStatus;
  createdBy: string;
  finalPricePaise?: number | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized for display convenience
  productName?: string;
  productSku?: string;
  vehicleCompatibility?: string;
  supplierName?: string;
  referencePricePaise?: number;
}

export interface Commitment {
  id: string;
  poolId: string;
  garageId: string;
  garageName?: string;
  userId: string;
  quantity: number;
  status: 'active' | 'withdrawn';
  estimatedUnitPricePaise: number;
  finalUnitPricePaise?: number | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized for display
  productName?: string;
  productSku?: string;
  cutoffAt?: string;
  poolStatus?: PoolStatus;
  poNumber?: string;
}

export type PurchaseOrderStatus = 
  | 'draft' 
  | 'issued' 
  | 'supplier_confirmed' 
  | 'fulfilled' 
  | 'cancelled';

export interface POLineItem {
  garageId: string;
  garageName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poolId: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productSku: string;
  productName: string;
  aggregateQuantity: number;
  applicableUnitPricePaise: number;
  totalAmountPaise: number;
  currency: 'INR';
  lineItems: POLineItem[];
  status: PurchaseOrderStatus;
  createdBy: string;
  createdAt: string;
  supplierConfirmedAt?: string | null;
}
