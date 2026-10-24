# ADOSX BulkBuy Security Specification

## 1. Data Invariants

1. **Role Separation**: Only verified administrators can create/modify products, configure suppliers, alter pricing tiers, close pools, or issue purchase orders.
2. **Garage Isolation**: Garage accounts may only create or edit commitments belonging to their own registered `garageId` and `userId`. A garage cannot read or write another garage's private contact details or private commitment records.
3. **Commitment Lifecycle Guard**: Commitments may only be created or modified when the target pool status is `'open'` and before the `cutoffAt` timestamp has elapsed.
4. **Demand Aggregation Authority**: While client-side previews calculate tentative totals, authoritative aggregate demand (`committedQuantity`) and tier prices are strictly maintained via server-side atomic transactions. Clients cannot fabricate `committedQuantity` or `finalPricePaise`.
5. **Exact Currency Representation**: All monetary values are strictly positive integers representing paise (`referencePricePaise`, `applicableUnitPricePaise`, `totalAmountPaise`). No floating-point amounts.
6. **Immutable Historical Audit**: Once a purchase order is generated, its core pricing line items, reference pool, and PO number are immutable.
7. **Idempotent Commitment Keys**: Document IDs for commitments follow `${poolId}_${garageId}` to strictly guarantee one active commitment per garage per pool.

## 2. The Dirty Dozen Payloads (Red Team Exploits)

1. **Attacker setting role to 'admin'**: Unauthenticated or garage user sends `{ role: 'admin' }` to `/users/{uid}`. MUST BE DENIED.
2. **Shadow Price Modification**: Garage attempts to write `{ finalPricePaise: 100 }` to `/pools/{poolId}`. MUST BE DENIED.
3. **Ghost Field Injection**: Malicious client sends `{ quantity: 50, isFreeOrder: true }` to `/commitments/{id}`. MUST BE DENIED.
4. **Spoofed Garage Ownership**: Garage A submits a commitment with `garageId: 'garage_b'`. MUST BE DENIED.
5. **Post-Cutoff Commitment**: Garage attempts to commit quantity after `cutoffAt` has passed. MUST BE DENIED.
6. **Negative Quantity Poisoning**: User submits `{ quantity: -100 }` to artificially manipulate aggregate pool thresholds. MUST BE DENIED.
7. **Float Currency Attack**: Attacker injects `{ referencePricePaise: 199.99 }` causing math rounding drift. MUST BE DENIED.
8. **Closed Pool Exploitation**: Attempt to join or update quantity on a pool with status `'closed'` or `'finalized'`. MUST BE DENIED.
9. **Direct PO Creation by Garage**: Non-admin attempts to insert document into `/purchaseOrders`. MUST BE DENIED.
10. **ID Character Flooding / DoS**: Submitting 2MB string as `poolId` or `commitmentId`. MUST BE DENIED.
11. **Admin Email Header Spoofing**: Attempt to execute admin action when `request.auth.token.email_verified == false`. MUST BE DENIED.
12. **PII Query Scraping**: Garage attempting `list` on all `/garages` or all `/commitments` to scrape competing garages' identities. MUST BE DENIED.

## 3. Test Runner Coverage

All 12 security vectors are systematically blocked by the Firestore ruleset, enforcing schema validation, role authentication, and document-level ownership barriers.
