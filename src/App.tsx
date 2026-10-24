/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Shell, ActiveTab } from './components/layout/Shell';
import { PoolsList } from './components/pools/PoolsList';
import { PoolDetail } from './components/pools/PoolDetail';
import { PartsCatalogue } from './components/parts/PartsCatalogue';
import { MyOrders } from './components/orders/MyOrders';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from './lib/firebase';
import { seedInitialData } from './lib/db-service';

function MainApp() {
  const { currentUser, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pools');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  // Check if initial seeding is needed on fresh boot
  useEffect(() => {
    async function checkAndSeed() {
      try {
        const poolSnap = await getDocs(query(collection(db, 'pools'), limit(1)));
        if (poolSnap.empty) {
          console.log('Seeding initial marketplace catalog and demand pools...');
          await seedInitialData(currentUser?.email, currentUser?.uid);
        }
      } catch (err) {
        console.warn('Boot check notice:', err);
      }
    }
    checkAndSeed();
  }, [currentUser]);

  const handleSelectPool = (poolId: string) => {
    setSelectedPoolId(poolId);
  };

  const handleBackToPools = () => {
    setSelectedPoolId(null);
  };

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSelectedPoolId(null); // Clear selected pool when changing tabs
  };

  return (
    <Shell activeTab={activeTab} onSelectTab={handleSelectTab} onSelectPool={handleSelectPool}>
      {/* If a pool is selected, show Pool Details (Screen B) */}
      {selectedPoolId ? (
        <PoolDetail poolId={selectedPoolId} onBack={handleBackToPools} />
      ) : (
        <>
          {activeTab === 'pools' && <PoolsList onSelectPool={handleSelectPool} />}
          {activeTab === 'parts' && <PartsCatalogue onSelectPool={handleSelectPool} />}
          {activeTab === 'orders' && <MyOrders onSelectPool={handleSelectPool} />}
          {activeTab === 'admin' && (isAdmin ? <AdminDashboard /> : <PoolsList onSelectPool={handleSelectPool} />)}
        </>
      )}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
