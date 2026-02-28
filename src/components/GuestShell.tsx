// src/components/GuestShell.tsx
// Shell pour les visiteurs non connectés — accès limité à Home, ProductDetail, SellerProfile
import React, { useState } from 'react';
import { HomePage } from '@/pages/HomePage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { SellerProfilePage } from '@/pages/SellerProfilePage';
import { GuestModal } from '@/components/GuestModal';
import { Product } from '@/types';

interface GuestShellProps {
  onAuthRequired: () => void; // appelé quand le visiteur veut se connecter
}

type GuestPage = 'home' | 'product-detail' | 'seller-profile';

export function GuestShell({ onAuthRequired }: GuestShellProps) {
  const [page, setPage]                   = useState<GuestPage>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [guestModal, setGuestModal]       = useState<{ visible: boolean; reason: any }>({ visible: false, reason: 'default' });

  const showGuest = (reason: any) => setGuestModal({ visible: true, reason });
  const hideGuest = () => setGuestModal({ visible: false, reason: 'default' });

  const goHome = () => { setPage('home'); setSelectedProduct(null); setSelectedSellerId(null); };

  return (
    <div className="min-h-screen bg-white">
      {/* Bannière "Mode visiteur" discrète en haut */}
      {page === 'home' && (
        <div className="bg-slate-900 text-white text-[11px] font-bold text-center py-2.5 px-4 flex items-center justify-center gap-3">
          <span>👋 Tu explores Brumerie en visiteur</span>
          <button onClick={onAuthRequired}
            className="bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider active:scale-95">
            Rejoindre
          </button>
        </div>
      )}

      {/* Pages accessibles */}
      {page === 'home' && (
        <HomePage
          onProductClick={(product) => { setSelectedProduct(product); setPage('product-detail'); }}
          onProfileClick={() => showGuest('default')}
          onNotificationsClick={() => showGuest('default')}
          isGuest
          onGuestAction={showGuest}
        />
      )}

      {page === 'product-detail' && selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
          onBack={goHome}
          onSellerClick={(id) => { setSelectedSellerId(id); setPage('seller-profile'); }}
          onStartChat={() => showGuest('message')}
          onProductClick={(p) => { setSelectedProduct(p); setPage('product-detail'); }}
          onBuyClick={() => showGuest('contact')}
          isGuest
          onGuestAction={showGuest}
        />
      )}

      {page === 'seller-profile' && selectedSellerId && (
        <SellerProfilePage
          sellerId={selectedSellerId}
          onBack={() => { if (selectedProduct) setPage('product-detail'); else goHome(); }}
          onProductClick={(p) => { setSelectedProduct(p); setPage('product-detail'); }}
          isGuest
          onGuestAction={showGuest}
        />
      )}

      {/* Modal visiteur */}
      <GuestModal
        visible={guestModal.visible}
        reason={guestModal.reason}
        onClose={hideGuest}
        onLogin={() => { hideGuest(); onAuthRequired(); }}
      />
    </div>
  );
}
