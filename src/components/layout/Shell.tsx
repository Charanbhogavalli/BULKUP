import React, { useState } from 'react';
import { useAuth, TEST_PERSONAS } from '../../lib/auth-context';
import {
  Layers,
  Wrench,
  Package,
  FileText,
  ShieldAlert,
  LogOut,
  LogIn,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';

export type ActiveTab = 'pools' | 'parts' | 'orders' | 'admin';

interface ShellProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onSelectPool?: (poolId: string) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  activeTab,
  onSelectTab,
  children,
}) => {
  const {
    currentUser,
    firebaseUser,
    activeGarage,
    isAdmin,
    signInWithGoogle,
    signOut,
    switchPersona,
    activePersonaId,
    seedDatabase,
  } = useAuth();

  const [isPersonaOpen, setIsPersonaOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedDatabase();
    } catch (err) {
      console.error('Failed to seed:', err);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8F5] text-[#171C18]">
      {/* Top System Bar / Enterprise Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E2E4DE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand Identity */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[#171C18] flex items-center justify-center font-bold text-xs tracking-wider text-[#C8F169]">
                AX
              </div>
              <div>
                <span className="font-semibold text-base tracking-tight text-[#171C18]">ADOSX BulkBuy</span>
                <span className="hidden sm:inline-block ml-2 text-xs font-mono text-[#5A6258] border-l border-[#E2E4DE] pl-2">
                  B2B Automotive Procurement
                </span>
              </div>
            </div>

            {/* Right: Role Persona Switcher & Auth */}
            <div className="flex items-center gap-3">
              {/* Persona Switcher Dropdown (for testing multi-garage transactions) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsPersonaOpen(!isPersonaOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-[#F7F8F5] border border-[#E2E4DE] rounded hover:border-[#171C18] transition-colors"
                  title="Switch between test garages or admin persona"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#5A6258]" />
                  <span className="text-[#5A6258] hidden sm:inline">Role:</span>
                  <span className="font-medium text-[#171C18]">
                    {isAdmin ? 'Admin' : activeGarage?.name || currentUser?.name || 'Garage'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#5A6258]" />
                </button>

                {isPersonaOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-[#E2E4DE] rounded-md shadow-lg py-2 z-50">
                    <div className="px-3 py-1.5 border-b border-[#E2E4DE] text-[11px] font-semibold text-[#5A6258] uppercase tracking-wider">
                      Switch Role Persona (Testing)
                    </div>
                    {TEST_PERSONAS.map((persona) => {
                      const isSelected = activePersonaId === persona.id;
                      return (
                        <button
                          key={persona.id}
                          type="button"
                          onClick={() => {
                            switchPersona(persona.id);
                            setIsPersonaOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8F5] flex flex-col gap-0.5 transition-colors ${
                            isSelected ? 'bg-[#F7F8F5] font-semibold' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[#171C18]">{persona.name}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                persona.role === 'admin'
                                  ? 'bg-[#171C18] text-[#C8F169]'
                                  : 'bg-[#E2E4DE] text-[#171C18]'
                              }`}
                            >
                              {persona.role.toUpperCase()}
                            </span>
                          </div>
                          {persona.garageName && (
                            <span className="text-[11px] text-[#5A6258]">{persona.garageName}</span>
                          )}
                        </button>
                      );
                    })}

                    <div className="pt-2 mt-2 border-t border-[#E2E4DE] px-3">
                      <button
                        type="button"
                        onClick={() => {
                          handleSeed();
                          setIsPersonaOpen(false);
                        }}
                        disabled={seeding}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-[#171C18] bg-[#F7F8F5] border border-[#E2E4DE] py-1.5 rounded hover:bg-[#E2E4DE] transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
                        <span>{seeding ? 'Resetting DB...' : 'Reset & Seed Demo Data'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Google Sign-in / Sign-out */}
              {firebaseUser ? (
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-1.5 text-xs text-[#5A6258] hover:text-[#171C18] py-1.5 px-2 rounded border border-transparent hover:border-[#E2E4DE]"
                  title="Sign out of Firebase Auth"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="flex items-center gap-1.5 text-xs bg-[#171C18] text-white hover:bg-black py-1.5 px-3 rounded font-medium transition-colors"
                  title="Authenticate via Google Firebase"
                >
                  <LogIn className="w-3.5 h-3.5 text-[#C8F169]" />
                  <span>Google Auth</span>
                </button>
              )}
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex space-x-1 sm:space-x-4 border-t border-[#E2E4DE] pt-1">
            <button
              type="button"
              onClick={() => onSelectTab('pools')}
              className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pools'
                  ? 'border-[#171C18] text-[#171C18]'
                  : 'border-transparent text-[#5A6258] hover:text-[#171C18] hover:border-[#E2E4DE]'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Demand Pools</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('parts')}
              className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'parts'
                  ? 'border-[#171C18] text-[#171C18]'
                  : 'border-transparent text-[#5A6258] hover:text-[#171C18] hover:border-[#E2E4DE]'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Parts</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('orders')}
              className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'orders'
                  ? 'border-[#171C18] text-[#171C18]'
                  : 'border-transparent text-[#5A6258] hover:text-[#171C18] hover:border-[#E2E4DE]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>My Orders</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onSelectTab('admin')}
                className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'admin'
                    ? 'border-[#171C18] text-[#171C18]'
                    : 'border-transparent text-[#5A6258] hover:text-[#171C18] hover:border-[#E2E4DE]'
                }`}
              >
                <Wrench className="w-4 h-4 text-[#5A6258]" />
                <span>Administration</span>
                <span className="text-[10px] bg-[#C8F169] text-[#171C18] px-1.5 py-0.2 rounded font-mono font-bold">
                  ADMIN
                </span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-[#E2E4DE] bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#5A6258] gap-2">
          <div>
            <span>ADOSX BulkBuy — B2B Spare Parts Demand Aggregator</span>
            <span className="mx-2">•</span>
            <span>Integer Paise Precision</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Role: <strong className="text-[#171C18]">{currentUser?.role || 'garage'}</strong></span>
            <span>•</span>
            <span>Garage: <strong className="text-[#171C18]">{activeGarage?.name || 'Standard Account'}</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
};
