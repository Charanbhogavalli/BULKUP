import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase';
import {
  Product,
  Supplier,
  Garage,
  Pool,
  Commitment,
  PurchaseOrder,
  UserProfile,
} from '../types';
import {
  calculateApplicableUnitPricePaise,
  isPoolCutoffPassed,
  CommitmentInputSchema,
} from './pricing';

const POOLS_COL = 'pools';
const COMMITMENTS_COL = 'commitments';
const PRODUCTS_COL = 'products';
const SUPPLIERS_COL = 'suppliers';
const GARAGES_COL = 'garages';
const USERS_COL = 'users';
const ADMINS_COL = 'admins';
const PURCHASE_ORDERS_COL = 'purchaseOrders';

/**
 * Seeds initial demo data if database is empty or on reset
 */
export async function seedInitialData(currentUserEmail?: string, currentUid?: string): Promise<void> {
  try {
    // 1. Seed Suppliers
    const suppliers: Supplier[] = [
      {
        id: 'sup_apex',
        name: 'Apex Auto Components Pvt Ltd',
        email: 'sales@apexautocomponents.in',
        phone: '+91 98450 11223',
        address: 'Plot 42, Peenya Industrial Area Phase 2, Bengaluru, Karnataka 560058',
        status: 'active',
      },
      {
        id: 'sup_kalyani',
        name: 'Kalyani Automotive Distributors',
        email: 'b2b@kalyaniauto.com',
        phone: '+91 98201 44556',
        address: 'B-14 MIDC Industrial Zone, Pune, Maharashtra 411018',
        status: 'active',
      },
    ];

    for (const sup of suppliers) {
      await setDoc(doc(db, SUPPLIERS_COL, sup.id), sup);
    }

    // 2. Seed Products
    const products: Product[] = [
      {
        id: 'prod_bsh_bp_7741',
        name: 'Bosch Front Ceramic Brake Pads (Set of 4)',
        sku: 'BSH-BP-7741',
        description: 'OEM-grade low-dust ceramic formulation designed for heavy Indian city stop-and-go driving. Superior bite and extended rotor lifespan.',
        category: 'Braking System',
        vehicleCompatibility: 'Maruti Suzuki Swift (2018-2024), Dzire (2017+), Baleno (2016+)',
        referencePricePaise: 100000, // ₹1,000.00
        supplierId: 'sup_apex',
        status: 'active',
      },
      {
        id: 'prod_val_ck_9920',
        name: 'Valeo Dry Clutch Pressure Plate & Release Bearing Kit',
        sku: 'VAL-CK-9920',
        description: 'Original equipment clutch assembly for 1.2L & 1.0L Turbo petrol engines. Smooth pedal effort with high torque transmission efficiency.',
        category: 'Transmission & Clutch',
        vehicleCompatibility: 'Hyundai i20 (2019-2024), Venue (2020+), Kia Sonet (2021+)',
        referencePricePaise: 420000, // ₹4,200.00
        supplierId: 'sup_kalyani',
        status: 'active',
      },
      {
        id: 'prod_lmx_hl_3310',
        name: 'Lumax Bi-LED Headlamp Projector Assembly (Right Hand)',
        sku: 'LMX-HL-3310',
        description: 'Certified E-mark projector assembly with integrated daytime running light (DRL). Impact-resistant polycarbonate lens.',
        category: 'Electrical & Lighting',
        vehicleCompatibility: 'Tata Nexon Facelift (2020-2023), Tata Altroz',
        referencePricePaise: 580000, // ₹5,800.00
        supplierId: 'sup_apex',
        status: 'active',
      },
    ];

    for (const prod of products) {
      await setDoc(doc(db, PRODUCTS_COL, prod.id), prod);
    }

    // 3. Seed Sample Garages
    const garages: Garage[] = [
      {
        id: 'garage_precision',
        name: 'Precision Motors & Service Hub',
        ownerUid: 'uid_garage_1',
        phone: '+91 98451 99001',
        address: '100ft Road, 12th Main, Indiranagar',
        city: 'Bengaluru',
        gstNumber: '29AABCP1330F1Z4',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'garage_autocare',
        name: 'AutoCare Garage & Workshop',
        ownerUid: 'uid_garage_2',
        phone: '+91 98860 33441',
        address: 'ITPL Main Road, Hope Farm Junction, Whitefield',
        city: 'Bengaluru',
        gstNumber: '29BCDFK9901M1ZQ',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'garage_torquepoint',
        name: 'Torque Point Auto Works',
        ownerUid: 'uid_garage_3',
        phone: '+91 97110 55662',
        address: 'Saki Naka Road, Andheri East',
        city: 'Mumbai',
        gstNumber: '27AABCT8840H1Z8',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    ];

    for (const gar of garages) {
      await setDoc(doc(db, GARAGES_COL, gar.id), gar);
    }

    // 4. Seed Active Demand Pools
    const in5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const in8Days = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const pool1: Pool = {
      id: 'pool_bsh_brake_pads',
      productId: 'prod_bsh_bp_7741',
      supplierId: 'sup_apex',
      pricingPolicy: 'pool_wide',
      tiers: [
        { minQuantity: 1, maxQuantity: 49, unitPricePaise: 100000 }, // ₹1,000
        { minQuantity: 50, maxQuantity: 99, unitPricePaise: 85000 },  // ₹850
        { minQuantity: 100, maxQuantity: null, unitPricePaise: 70000 }, // ₹700
      ],
      minimumQuantity: 50,
      targetQuantity: 100,
      committedQuantity: 35, // 15 from AutoCare + 20 from Torque Point
      cutoffAt: in5Days,
      status: 'open',
      createdBy: 'admin_seed',
      finalPricePaise: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      productName: 'Bosch Front Ceramic Brake Pads (Set of 4)',
      productSku: 'BSH-BP-7741',
      vehicleCompatibility: 'Maruti Suzuki Swift (2018-2024), Dzire (2017+), Baleno (2016+)',
      supplierName: 'Apex Auto Components Pvt Ltd',
      referencePricePaise: 100000,
    };

    const pool2: Pool = {
      id: 'pool_val_clutch_kit',
      productId: 'prod_val_ck_9920',
      supplierId: 'sup_kalyani',
      pricingPolicy: 'pool_wide',
      tiers: [
        { minQuantity: 1, maxQuantity: 19, unitPricePaise: 420000 }, // ₹4,200
        { minQuantity: 20, maxQuantity: 49, unitPricePaise: 360000 }, // ₹3,600
        { minQuantity: 50, maxQuantity: null, unitPricePaise: 310000 }, // ₹3,100
      ],
      minimumQuantity: 20,
      targetQuantity: 50,
      committedQuantity: 22, // 12 from AutoCare + 10 from Torque Point
      cutoffAt: in8Days,
      status: 'open',
      createdBy: 'admin_seed',
      finalPricePaise: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      productName: 'Valeo Dry Clutch Pressure Plate & Release Bearing Kit',
      productSku: 'VAL-CK-9920',
      vehicleCompatibility: 'Hyundai i20 (2019-2024), Venue (2020+), Kia Sonet (2021+)',
      supplierName: 'Kalyani Automotive Distributors',
      referencePricePaise: 420000,
    };

    await setDoc(doc(db, POOLS_COL, pool1.id), pool1);
    await setDoc(doc(db, POOLS_COL, pool2.id), pool2);

    // 5. Seed Commitments for Pool 1
    const commitment1: Commitment = {
      id: `${pool1.id}_garage_autocare`,
      poolId: pool1.id,
      garageId: 'garage_autocare',
      garageName: 'AutoCare Garage & Workshop',
      userId: 'uid_garage_2',
      quantity: 15,
      status: 'active',
      estimatedUnitPricePaise: 100000, // Below 50 threshold currently
      finalUnitPricePaise: null,
      createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      productName: pool1.productName,
      productSku: pool1.productSku,
      cutoffAt: pool1.cutoffAt,
      poolStatus: pool1.status,
    };

    const commitment2: Commitment = {
      id: `${pool1.id}_garage_torquepoint`,
      poolId: pool1.id,
      garageId: 'garage_torquepoint',
      garageName: 'Torque Point Auto Works',
      userId: 'uid_garage_3',
      quantity: 20,
      status: 'active',
      estimatedUnitPricePaise: 100000,
      finalUnitPricePaise: null,
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      productName: pool1.productName,
      productSku: pool1.productSku,
      cutoffAt: pool1.cutoffAt,
      poolStatus: pool1.status,
    };

    // Commitments for Pool 2 (reached Tier 2 threshold of 20 units)
    const commitment3: Commitment = {
      id: `${pool2.id}_garage_autocare`,
      poolId: pool2.id,
      garageId: 'garage_autocare',
      garageName: 'AutoCare Garage & Workshop',
      userId: 'uid_garage_2',
      quantity: 12,
      status: 'active',
      estimatedUnitPricePaise: 360000, // Unlocked ₹3,600 Tier 2!
      finalUnitPricePaise: null,
      createdAt: new Date(Date.now() - 20 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 3600000).toISOString(),
      productName: pool2.productName,
      productSku: pool2.productSku,
      cutoffAt: pool2.cutoffAt,
      poolStatus: pool2.status,
    };

    const commitment4: Commitment = {
      id: `${pool2.id}_garage_torquepoint`,
      poolId: pool2.id,
      garageId: 'garage_torquepoint',
      garageName: 'Torque Point Auto Works',
      userId: 'uid_garage_3',
      quantity: 10,
      status: 'active',
      estimatedUnitPricePaise: 360000,
      finalUnitPricePaise: null,
      createdAt: new Date(Date.now() - 15 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 3600000).toISOString(),
      productName: pool2.productName,
      productSku: pool2.productSku,
      cutoffAt: pool2.cutoffAt,
      poolStatus: pool2.status,
    };

    await setDoc(doc(db, COMMITMENTS_COL, commitment1.id), commitment1);
    await setDoc(doc(db, COMMITMENTS_COL, commitment2.id), commitment2);
    await setDoc(doc(db, COMMITMENTS_COL, commitment3.id), commitment3);
    await setDoc(doc(db, COMMITMENTS_COL, commitment4.id), commitment4);

    // 6. Ensure current user is registered as admin if email provided
    if (currentUserEmail && currentUid) {
      await setDoc(doc(db, ADMINS_COL, currentUid), {
        uid: currentUid,
        email: currentUserEmail,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, USERS_COL, currentUid), {
        uid: currentUid,
        name: 'Administrator',
        email: currentUserEmail,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
    }

    console.log('Seed data successfully initialized.');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed');
  }
}

/**
 * Commit or update quantity in a pool.
 * Uses atomic Firestore transaction to safely update pool committed quantity
 * and recalculate unit prices.
 */
export async function commitToPool(params: {
  poolId: string;
  garageId: string;
  garageName: string;
  userId: string;
  quantity: number;
}): Promise<{ success: boolean; newPricePaise: number; totalCommitted: number }> {
  // Input validation
  const validation = CommitmentInputSchema.safeParse({
    poolId: params.poolId,
    quantity: params.quantity,
  });

  if (!validation.success) {
    throw new Error(validation.error.issues[0]?.message || 'Invalid commitment parameters');
  }

  const poolRef = doc(db, POOLS_COL, params.poolId);
  const commitmentDocId = `${params.poolId}_${params.garageId}`;
  const commitmentRef = doc(db, COMMITMENTS_COL, commitmentDocId);

  try {
    return await runTransaction(db, async (transaction) => {
      const poolSnap = await transaction.get(poolRef);
      if (!poolSnap.exists()) {
        throw new Error('Demand pool not found');
      }

      const poolData = poolSnap.data() as Pool;

      // Rule: Pool must be open
      if (poolData.status !== 'open') {
        throw new Error(`Cannot commit to pool: Status is '${poolData.status}'. Only 'open' pools accept commitments.`);
      }

      // Rule: Cutoff must not have passed
      if (isPoolCutoffPassed(poolData.cutoffAt)) {
        throw new Error('Cannot commit to pool: Cutoff deadline has passed.');
      }

      // Read existing commitment if any
      const existingSnap = await transaction.get(commitmentRef);
      let prevQuantity = 0;

      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as Commitment;
        if (existingData.status === 'active') {
          prevQuantity = existingData.quantity;
        }
      }

      const delta = params.quantity - prevQuantity;
      const newTotalCommitted = Math.max(0, poolData.committedQuantity + delta);

      // Recalculate applicable unit price for the pool
      const refPrice = poolData.referencePricePaise || poolData.tiers[0]?.unitPricePaise || 0;
      const applicableUnitPrice = calculateApplicableUnitPricePaise(
        newTotalCommitted,
        poolData.tiers,
        refPrice,
        poolData.pricingPolicy
      );

      const now = new Date().toISOString();

      // Write commitment
      const commitmentPayload: Commitment = {
        id: commitmentDocId,
        poolId: params.poolId,
        garageId: params.garageId,
        garageName: params.garageName,
        userId: params.userId,
        quantity: params.quantity,
        status: 'active',
        estimatedUnitPricePaise: applicableUnitPrice,
        finalUnitPricePaise: null,
        createdAt: existingSnap.exists() ? (existingSnap.data() as Commitment).createdAt : now,
        updatedAt: now,
        productName: poolData.productName,
        productSku: poolData.productSku,
        cutoffAt: poolData.cutoffAt,
        poolStatus: poolData.status,
      };

      transaction.set(commitmentRef, cleanFirestoreData(commitmentPayload));

      // Update pool aggregate quantity
      transaction.update(poolRef, {
        committedQuantity: newTotalCommitted,
        updatedAt: now,
      });

      return {
        success: true,
        newPricePaise: applicableUnitPrice,
        totalCommitted: newTotalCommitted,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${POOLS_COL}/${params.poolId}`);
  }
}

/**
 * Withdraw an existing active commitment
 */
export async function withdrawCommitment(params: {
  poolId: string;
  garageId: string;
  userId: string;
}): Promise<{ success: boolean; totalCommitted: number }> {
  const poolRef = doc(db, POOLS_COL, params.poolId);
  const commitmentDocId = `${params.poolId}_${params.garageId}`;
  const commitmentRef = doc(db, COMMITMENTS_COL, commitmentDocId);

  try {
    return await runTransaction(db, async (transaction) => {
      const poolSnap = await transaction.get(poolRef);
      if (!poolSnap.exists()) {
        throw new Error('Demand pool not found');
      }

      const poolData = poolSnap.data() as Pool;

      if (poolData.status !== 'open') {
        throw new Error(`Cannot withdraw commitment: Pool status is '${poolData.status}'.`);
      }

      if (isPoolCutoffPassed(poolData.cutoffAt)) {
        throw new Error('Cannot withdraw commitment: Cutoff deadline has passed.');
      }

      const commitmentSnap = await transaction.get(commitmentRef);
      if (!commitmentSnap.exists()) {
        throw new Error('No existing commitment found to withdraw.');
      }

      const commitmentData = commitmentSnap.data() as Commitment;
      if (commitmentData.status === 'withdrawn') {
        return { success: true, totalCommitted: poolData.committedQuantity };
      }

      // Ensure ownership
      if (commitmentData.userId !== params.userId && commitmentData.garageId !== params.garageId) {
        throw new Error('Unauthorized to withdraw this commitment.');
      }

      const newTotalCommitted = Math.max(0, poolData.committedQuantity - commitmentData.quantity);
      const now = new Date().toISOString();

      transaction.update(commitmentRef, {
        status: 'withdrawn',
        updatedAt: now,
      });

      transaction.update(poolRef, {
        committedQuantity: newTotalCommitted,
        updatedAt: now,
      });

      return {
        success: true,
        totalCommitted: newTotalCommitted,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${COMMITMENTS_COL}/${params.poolId}_${params.garageId}`);
  }
}

/**
 * Close a pool (Admin action)
 */
export async function closePool(poolId: string): Promise<void> {
  try {
    const poolRef = doc(db, POOLS_COL, poolId);
    await updateDoc(poolRef, {
      status: 'closed',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POOLS_COL}/${poolId}`);
  }
}

/**
 * Cancel a pool (Admin action)
 */
export async function cancelPool(poolId: string): Promise<void> {
  try {
    const poolRef = doc(db, POOLS_COL, poolId);
    await updateDoc(poolRef, {
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${POOLS_COL}/${poolId}`);
  }
}

/**
 * Reconciles and finalizes an eligible pool, locking the final price and generating
 * an official supplier Purchase Order idempotently.
 */
export async function finalizePoolAndGeneratePO(params: {
  poolId: string;
  adminUid: string;
}): Promise<PurchaseOrder> {
  const poolRef = doc(db, POOLS_COL, params.poolId);

  try {
    // Check if PO already generated (idempotent guard)
    const existingPoQuery = query(
      collection(db, PURCHASE_ORDERS_COL),
      where('poolId', '==', params.poolId)
    );
    const existingPoSnap = await getDocs(existingPoQuery);
    if (!existingPoSnap.empty) {
      return existingPoSnap.docs[0].data() as PurchaseOrder;
    }

    return await runTransaction(db, async (transaction) => {
      const poolSnap = await transaction.get(poolRef);
      if (!poolSnap.exists()) {
        throw new Error('Pool not found');
      }

      const pool = poolSnap.data() as Pool;
      if (pool.status === 'finalized') {
        throw new Error('Pool has already been finalized.');
      }
      if (pool.status === 'cancelled') {
        throw new Error('Cannot finalize a cancelled pool.');
      }

      // Check minimum order viability
      if (pool.committedQuantity < pool.minimumQuantity) {
        throw new Error(
          `Pool demand (${pool.committedQuantity} units) has not reached the required minimum threshold of ${pool.minimumQuantity} units.`
        );
      }

      // Calculate final unit price
      const refPrice = pool.referencePricePaise || pool.tiers[0]?.unitPricePaise || 0;
      const finalPricePaise = calculateApplicableUnitPricePaise(
        pool.committedQuantity,
        pool.tiers,
        refPrice,
        pool.pricingPolicy
      );

      // Read all active commitments for this pool
      const commitmentsQuery = query(
        collection(db, COMMITMENTS_COL),
        where('poolId', '==', params.poolId),
        where('status', '==', 'active')
      );
      const commitmentsSnap = await getDocs(commitmentsQuery);

      const lineItems = commitmentsSnap.docs.map((docSnap) => {
        const c = docSnap.data() as Commitment;
        return {
          garageId: c.garageId,
          garageName: c.garageName || 'Registered Garage',
          quantity: c.quantity,
          unitPricePaise: finalPricePaise,
          subtotalPaise: c.quantity * finalPricePaise,
        };
      });

      const totalAmountPaise = pool.committedQuantity * finalPricePaise;
      const now = new Date().toISOString();
      const poYear = new Date().getFullYear();
      const poRandom = Math.floor(1000 + Math.random() * 9000);
      const poNumber = `PO-${poYear}-${poRandom}`;
      const poId = `po_${params.poolId}`;
      const poRef = doc(db, PURCHASE_ORDERS_COL, poId);

      const purchaseOrder: PurchaseOrder = {
        id: poId,
        poNumber,
        poolId: params.poolId,
        supplierId: pool.supplierId,
        supplierName: pool.supplierName || 'Automotive Supplier',
        productId: pool.productId,
        productSku: pool.productSku || 'SKU-UNKNOWN',
        productName: pool.productName || 'Automotive Spare Part',
        aggregateQuantity: pool.committedQuantity,
        applicableUnitPricePaise: finalPricePaise,
        totalAmountPaise,
        currency: 'INR',
        lineItems,
        status: 'issued',
        createdBy: params.adminUid,
        createdAt: now,
        supplierConfirmedAt: null,
      };

      // 1. Write Purchase Order
      transaction.set(poRef, cleanFirestoreData(purchaseOrder));

      // 2. Mark pool as finalized
      transaction.update(poolRef, {
        status: 'finalized',
        finalPricePaise,
        updatedAt: now,
      });

      // 3. Update all commitments with final unit price and PO reference
      commitmentsSnap.docs.forEach((cDoc) => {
        transaction.update(cDoc.ref, {
          finalUnitPricePaise: finalPricePaise,
          poNumber,
          poolStatus: 'finalized',
          updatedAt: now,
        });
      });

      return purchaseOrder;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${POOLS_COL}/${params.poolId}`);
  }
}

/**
 * Update Purchase Order status (Admin action)
 */
export async function updatePurchaseOrderStatus(
  orderId: string,
  newStatus: PurchaseOrder['status']
): Promise<void> {
  try {
    const poRef = doc(db, PURCHASE_ORDERS_COL, orderId);
    const updates: Partial<PurchaseOrder> = {
      status: newStatus,
    };
    if (newStatus === 'supplier_confirmed') {
      updates.supplierConfirmedAt = new Date().toISOString();
    }
    await updateDoc(poRef, cleanFirestoreData(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PURCHASE_ORDERS_COL}/${orderId}`);
  }
}

/**
 * Admin: Create a new Demand Pool
 */
export async function createDemandPool(poolData: Omit<Pool, 'id' | 'createdAt' | 'updatedAt' | 'committedQuantity' | 'finalPricePaise'>): Promise<string> {
  try {
    const poolId = `pool_${Date.now()}`;
    const poolRef = doc(db, POOLS_COL, poolId);
    const now = new Date().toISOString();

    const newPool: Pool = {
      ...poolData,
      id: poolId,
      committedQuantity: 0,
      finalPricePaise: null,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(poolRef, cleanFirestoreData(newPool));
    return poolId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, POOLS_COL);
  }
}

/**
 * Admin: Create or edit a product
 */
export async function saveProduct(product: Product): Promise<void> {
  try {
    const productRef = doc(db, PRODUCTS_COL, product.id);
    await setDoc(productRef, cleanFirestoreData(product), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${PRODUCTS_COL}/${product.id}`);
  }
}

/**
 * Admin: Create or edit a supplier
 */
export async function saveSupplier(supplier: Supplier): Promise<void> {
  try {
    const supRef = doc(db, SUPPLIERS_COL, supplier.id);
    await setDoc(supRef, cleanFirestoreData(supplier), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SUPPLIERS_COL}/${supplier.id}`);
  }
}
