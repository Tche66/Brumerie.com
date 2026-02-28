import { VerifiedTag } from '@/components/VerifiedTag';
import { ConditionBadge } from '@/components/ConditionBadge';
import React, { useState, useRef, useEffect } from 'react';
import { Product } from '@/types';
import { CATEGORIES } from '@/types';
import { formatPrice, formatRelativeDate } from '@/utils/helpers';
import { getProducts, incrementViewCount, incrementContactCount } from '@/services/productService';
import { addBookmark, removeBookmark } from '@/services/bookmarkService';
import { useAuth } from '@/contexts/AuthContext';
import { ImageLightbox } from '@/components/ImageLightbox';
import { getOrCreateConversation, checkChatLimit } from '@/services/messagingService';
import { subscribeSellerReviews } from '@/services/reviewService';
import { Review } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { shareProduct } from '@/utils/shareProduct';
import { OfferModal } from '@/components/OfferModal';

interface ProductDetailPageProps {
  product: Product;
  onBack: () => void;
  onSellerClick: (sellerId: string) => void;
  onStartChat?: (convId: string) => void;
  onBuyClick?: (product: any) => void;
  onProductClick?: (product: Product) => void;
  isGuest?: boolean;
  onGuestAction?: (reason: string) => void;
}

export function ProductDetailPage({ product, onBack, onSellerClick, onStartChat, onBuyClick, onProductClick, isGuest, onGuestAction }: ProductDetailPageProps) {
  const { currentUser, userProfile, refreshUserProfile } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [lastDist, setLastDist] = useState<number | null>(null);
  const [chatLimitError, setChatLimitError] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  // Compteurs live — initialisés à -1 (chargement) pour éviter le flash
  const [liveViewCount, setLiveViewCount] = useState<number>(-1);
  const [liveContactCount, setLiveContactCount] = useState<number>(-1);
  const viewIncrementedRef = useRef(false); // évite double incrément en StrictMode
  const scrollRef = useRef<HTMLDivElement>(null);

  const categoryLabel = CATEGORIES.find(c => c.id === product.category)?.label || product.category;

  // ── Abonnement temps réel + incrément vue en une seule opération ──
  useEffect(() => {
    viewIncrementedRef.current = false;
    const isSeller = currentUser?.uid === product.sellerId;

    const unsub = onSnapshot(doc(db, 'products', product.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLiveViewCount(data.viewCount ?? 0);
      setLiveContactCount(data.whatsappClickCount ?? 0);

      // Incrémenter UNE SEULE FOIS après le premier snapshot — jamais pour le vendeur
      if (!viewIncrementedRef.current && !isSeller && currentUser) {
        viewIncrementedRef.current = true;
        incrementViewCount(product.id).catch(e =>
          console.error('[ViewCount] Règles Firestore — voir FIRESTORE_RULES.md :', e)
        );
      }
    });

    return () => {
      viewIncrementedRef.current = false;
      unsub();
    };
  }, [product.id, currentUser?.uid]);

  // Bookmark sync
  useEffect(() => {
    const ids = userProfile?.bookmarkedProductIds || [];
    setIsBookmarked(ids.includes(product.id));
  }, [userProfile, product.id]);

  // Reviews du vendeur
  useEffect(() => {
    if (!product.sellerId) return;
    const unsub = subscribeSellerReviews(product.sellerId, (r, avg, cnt) => {
      setReviews(r);
      setAvgRating(avg);
      setReviewCount(cnt);
    });
    return unsub;
  }, [product.sellerId]);

  // Produits similaires (même catégorie, pas le même)
  useEffect(() => {
    getProducts({ category: product.category }).then(all => {
      setSimilarProducts(
        all.filter(p => p.id !== product.id && p.status !== 'sold').slice(0, 6)
      );
    }).catch(() => {});
  }, [product.id, product.category]);

  const handleStartChat = async () => {
    if (isGuest) { onGuestAction?.('message'); return; }
    if (!currentUser || !userProfile) return;
    if (currentUser.uid === product.sellerId) return;
    const limitCheck = await checkChatLimit(currentUser.uid);
    if (!limitCheck.allowed) { setChatLimitError(limitCheck.reason || ''); return; }
    setChatLimitError('');
    setStartingChat(true);
    try {
      const convId = await getOrCreateConversation(
        currentUser.uid, product.sellerId,
        { id: product.id, title: product.title, price: product.price, image: product.images?.[0] || '', neighborhood: product.neighborhood },
        userProfile.name, product.sellerName, userProfile.photoURL, product.sellerPhoto,
      );
      // ✅ Comptabiliser le contact via le messenger (pas WhatsApp)
      await incrementContactCount(product.id, product.sellerId);
      onStartChat?.(convId);
    } catch (e) { console.error('[Chat]', e); }
    finally { setStartingChat(false); }
  };

  const handleBookmark = async () => {
    if (isGuest) { onGuestAction?.('bookmark'); return; }
    if (!currentUser) return;
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      if (next) await addBookmark(currentUser.uid, product.id);
      else await removeBookmark(currentUser.uid, product.id);
      await refreshUserProfile();
    } catch { setIsBookmarked(!next); }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const width = scrollRef.current.offsetWidth;
      const newIndex = Math.round(scrollRef.current.scrollLeft / width);
      if (newIndex !== currentImageIndex) setCurrentImageIndex(newIndex);
    }
  };

  const scrollToImage = (index: number) => {
    scrollRef.current?.scrollTo({ left: scrollRef.current.offsetWidth * index, behavior: 'smooth' });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastDist(Math.hypot(dx, dy));
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setScale(Math.min(Math.max(scale * (dist / lastDist), 1), 3));
      setLastDist(dist);
    }
  };
  const handleTouchEnd = () => { setLastDist(null); if (scale < 1.1) setScale(1); };
  const handleDoubleTap = () => setScale(prev => prev > 1 ? 1 : 2);

  const handleShare = async () => {
    try {
      await shareProduct(product);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {}
  };

  const handleSendOffer = async (offerPrice: number, message: string) => {
    if (!currentUser || !userProfile) return;
    if (currentUser.uid === product.sellerId) return;
    // Créer ou récupérer la conversation
    const { getOrCreateConversation, sendMessage } = await import('@/services/messagingService');
    const convId = await getOrCreateConversation(
      currentUser.uid, product.sellerId,
      { id: product.id, title: product.title, price: product.price, image: product.images?.[0] || '', neighborhood: product.neighborhood },
      userProfile.name, product.sellerName, userProfile.photoURL, product.sellerPhoto,
    );
    // Formater le message offre
    const offerText = [
      '💰 *OFFRE DE PRIX*',
      `Article : ${product.title}`,
      `Prix demandé : ${product.price.toLocaleString('fr-FR')} FCFA`,
      `Ma proposition : *${offerPrice.toLocaleString('fr-FR')} FCFA*`,
      message ? `Message : "${message}"` : '',
    ].filter(Boolean).join('\n');
    await sendMessage(convId, currentUser.uid, offerText, userProfile.name, userProfile.photoURL);
    onStartChat?.(convId);
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    const subject = encodeURIComponent('Signalement produit - Brumerie');
    const body = encodeURIComponent(`Produit : ${product.title}\nVendeur : ${product.sellerName}\nID : ${product.id}\nRaison : ${reportReason}`);
    window.open(`mailto:contact.brumerie@gmail.com?subject=${subject}&body=${body}`, '_blank');
    setReportSent(true);
    setTimeout(() => setShowReportModal(false), 2000);
  };

  const createdAtDate = product.createdAt?.toDate ? product.createdAt.toDate() : new Date(product.createdAt);
  const isNew = new Date().getTime() - createdAtDate.getTime() < 48 * 60 * 60 * 1000;
  const isSelf = currentUser?.uid === product.sellerId;

  return (
    <div className="min-h-screen bg-white pb-32 font-sans">

      {/* ── SLIDER PHOTOS ── */}
      <div className="relative bg-slate-100" style={{ aspectRatio: '1/1' }}>
        <div ref={scrollRef} onScroll={handleScroll}
          className="flex overflow-x-auto h-full snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}>
          {product.images.map((img, idx) => (
            <div key={idx} className="w-full h-full flex-shrink-0 snap-center overflow-hidden"
              onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
              onDoubleClick={handleDoubleTap}
              style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
              onClick={() => { if (scale <= 1) { setLightboxIndex(idx); setLightboxOpen(true); } }}>
              <img src={img} alt={product.title}
                className="w-full h-full object-cover transition-transform duration-200"
                style={{ transform: idx === currentImageIndex ? `scale(${scale})` : 'scale(1)' }}
                draggable={false} />
            </div>
          ))}
        </div>

        {scale === 1 && product.images.length > 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/30 backdrop-blur-md px-3 py-1 rounded-full">
            <p className="text-[9px] text-white font-bold">Tap pour agrandir · Pincer pour zoomer</p>
          </div>
        )}

        {/* Boutons top */}
        <div className="absolute top-6 left-0 right-0 px-6 flex justify-between items-center z-10">
          <button onClick={onBack} className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-xl active:scale-90 transition-all">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#0F172A" strokeWidth="3"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="flex gap-2">
            <button onClick={handleBookmark} className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-xl active:scale-90 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24"
                fill={isBookmarked ? '#1D9BF0' : 'none'}
                stroke={isBookmarked ? '#1D9BF0' : '#0F172A'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
            </button>
            <button onClick={handleShare} className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-xl active:scale-90 transition-all">
              {copySuccess
                ? <span className="text-[10px] font-black text-green-600">OK</span>
                : <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#0F172A" strokeWidth="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Badges status */}
        <div className="absolute top-24 right-6 flex flex-col gap-2 z-10">
          {isNew && <span className="bg-green-600 text-white text-[9px] font-black px-4 py-2 rounded-full shadow-lg uppercase">NOUVEAU</span>}
          {product.status === 'sold' && <span className="bg-slate-900 text-white text-[9px] font-black px-4 py-2 rounded-full shadow-lg uppercase">VENDU</span>}
        </div>

        {/* Dots */}
        {product.images.length > 1 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
            {product.images.map((_, idx) => (
              <button key={idx} onClick={() => scrollToImage(idx)}
                className={`rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-5 h-2' : 'bg-white/40 w-2 h-2'}`}/>
            ))}
          </div>
        )}
        <div className="absolute bottom-6 left-6 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full">
          <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{currentImageIndex + 1} / {product.images.length}</p>
        </div>
      </div>

      {/* ── INFOS PRODUIT ── */}
      <div className="px-6 py-8">

        {/* Prix + catégorie */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="price-brumerie text-[38px] text-slate-900 leading-none" style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, letterSpacing:'-0.04em' }}>
                {product.price.toLocaleString('fr-FR')} <span className="text-[20px] text-slate-400 font-bold" style={{ fontFamily:"'DM Sans',sans-serif" }}>FCFA</span>
              </p>
              {product.originalPrice && product.originalPrice > product.price && (() => {
                const pct = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 line-through text-[15px] font-bold">{product.originalPrice.toLocaleString('fr-FR')}</span>
                    <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-1 rounded-xl">-{pct}%</span>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#94A3B8"><path d="M12 2a8 8 0 00-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 00-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"/></svg>
              <span>{product.neighborhood}</span>
              <span className="w-1 h-1 bg-slate-200 rounded-full"/>
              <span>{formatRelativeDate(product.createdAt)}</span>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-700 text-[9px] font-black px-4 py-2 rounded-xl uppercase tracking-widest">{categoryLabel}</span>
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-3 leading-tight uppercase">{product.title}</h1>

        {/* État + Quantité */}
        {(product.condition || (product.quantity && product.quantity > 1)) && (
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            {product.condition && <ConditionBadge condition={product.condition} size="md" />}
            {product.quantity && product.quantity > 1 && (
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                {product.quantity} disponibles
              </span>
            )}
          </div>
        )}

        {/* Description */}
        <div className="bg-slate-50 rounded-3xl p-5 mb-6 border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Description</p>
          <p className="text-slate-700 text-sm leading-relaxed font-medium">{product.description || 'Aucune description fournie.'}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <p className="text-xl font-black text-slate-900">
              {liveContactCount === -1 ? '…' : liveContactCount}
            </p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mt-0.5">Contacts</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <p className="text-xl font-black text-slate-900">
              {liveViewCount === -1 ? '…' : liveViewCount}
            </p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mt-0.5">Vues</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
            <p className={`text-sm font-black ${product.status === 'sold' ? 'text-red-500' : 'text-green-600'}`}>
              {product.status === 'sold' ? 'Vendu' : 'Dispo'}
            </p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mt-0.5">Statut</p>
          </div>
        </div>

        {/* ── CARTE VENDEUR enrichie ── */}
        <button onClick={() => onSellerClick(product.sellerId)}
          className="w-full bg-slate-900 rounded-[2.5rem] p-5 flex items-center gap-4 active:scale-95 transition-all shadow-2xl mb-6">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 border-2 border-white/20 shrink-0">
            {product.sellerPhoto
              ? <img src={product.sellerPhoto} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full flex items-center justify-center bg-green-500 text-white text-xl font-black">{product.sellerName?.charAt(0).toUpperCase()}</div>
            }
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-black text-white text-sm uppercase truncate">{product.sellerName}</span>
              {(product.sellerVerified || product.sellerPremium) && (
                <VerifiedTag tier={product.sellerPremium ? 'premium' : 'verified'} size="xs" />
              )}
            </div>
            {/* Note du vendeur */}
            {avgRating > 0 && (
              <div className="flex items-center gap-1.5 mb-1">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="10" height="10" viewBox="0 0 24 24" fill={avgRating >= s ? '#FBBF24' : '#374151'} stroke="none">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 font-bold">{avgRating.toFixed(1)} ({reviewCount} avis)</span>
              </div>
            )}
            <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Voir la boutique →</p>
          </div>
        </button>

        {/* ── AVIS DU VENDEUR ── */}
        {reviews.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Avis sur ce vendeur</p>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill={avgRating >= s ? '#FBBF24' : '#E2E8F0'} stroke="none">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <span className="text-[10px] font-black text-slate-500">{avgRating.toFixed(1)}</span>
              </div>
            </div>
            <div className="space-y-3">
              {reviews.slice(0, 3).map(r => (
                <div key={r.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                      {r.fromUserPhoto
                        ? <img src={r.fromUserPhoto} alt="" className="w-full h-full object-cover"/>
                        : <div className="w-full h-full flex items-center justify-center text-slate-500 font-black text-sm">{r.fromUserName?.charAt(0)}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 text-[11px] truncate">{r.fromUserName}</p>
                      <div className="flex gap-0.5 mt-0.5">
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="9" height="9" viewBox="0 0 24 24" fill={r.rating >= s ? '#FBBF24' : '#E2E8F0'} stroke="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                  {r.comment && <p className="text-[11px] text-slate-600 italic">"{r.comment}"</p>}
                </div>
              ))}
              {reviews.length > 3 && (
                <button onClick={() => onSellerClick(product.sellerId)}
                  className="w-full py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-2xl">
                  Voir tous les {reviewCount} avis →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PRODUITS SIMILAIRES ── */}
        {similarProducts.length > 0 && (
          <div className="mb-8">
            <p className="font-black text-slate-900 text-sm uppercase tracking-tight mb-4">Articles similaires</p>
            <div className="grid grid-cols-2 gap-3">
              {similarProducts.slice(0, 4).map(p => (
                <div key={p.id} className="active:scale-95 transition-transform">
                  <ProductCard
                    product={p}
                    onClick={() => onProductClick?.(p)}
                    onBookmark={() => {}}
                    isBookmarked={false}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signaler */}
        <button onClick={() => setShowReportModal(true)}
          className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Signaler cette annonce
        </button>
      </div>

      {/* ── FOOTER FIXE ── */}
      {chatLimitError && (
        <div className="fixed bottom-24 left-4 right-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 z-40 shadow-lg">
          <p className="text-[11px] font-bold text-amber-700">⚠️ {chatLimitError}</p>
          <button onClick={() => setChatLimitError('')} className="absolute top-2 right-3 text-amber-400 font-black text-sm">×</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 p-4">
        {product.status === 'sold' ? (
          <div className="w-full py-5 rounded-2xl bg-slate-100 text-slate-300 font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center">VENDU</div>
        ) : isSelf ? (
          <div className="w-full py-4 rounded-2xl bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center">Ton annonce</div>
        ) : (
          <div className="flex gap-3">
            <button onClick={handleStartChat} disabled={startingChat}
              className="flex-1 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 bg-slate-100 text-slate-700 active:scale-95 transition-all disabled:opacity-50">
              {startingChat
                ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"/>
                : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>Discuter</>
              }
            </button>
            {/* Bouton Faire une offre */}
            {!isGuest && currentUser?.uid !== product.sellerId && product.status !== 'sold' && (
              <button onClick={() => { if (isGuest) { onGuestAction?.('offer'); return; } setShowOffer(true); }}
                className="flex-1 py-5 rounded-[2rem] font-black text-[12px] uppercase tracking-widest border-2 border-slate-200 text-slate-700 bg-white active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                💰 Faire une offre
              </button>
            )}
            <button onClick={() => { if (isGuest) { onGuestAction?.('contact'); return; } onBuyClick?.(product); }}
              className="flex-[2] py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest text-white flex items-center justify-center gap-2 shadow-xl shadow-green-200 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,#16A34A,#115E2E)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              Acheter
            </button>
          </div>
        )}
      </div>

      {/* ── MODAL SIGNALEMENT ── */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[300] flex items-end justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"/>
            {reportSent ? (
              <div className="text-center py-6">
                <p className="text-3xl mb-3">✅</p>
                <p className="font-black text-slate-900 text-lg uppercase">Signalement envoyé</p>
                <p className="text-slate-400 text-[11px] mt-1">Merci, nous allons examiner cette annonce.</p>
              </div>
            ) : (
              <>
                <p className="font-black text-slate-900 text-lg uppercase tracking-tight mb-1">Signaler cette annonce</p>
                <p className="text-slate-400 text-[11px] mb-6">{product.title} · {product.sellerName}</p>
                <div className="space-y-2 mb-6">
                  {['Produit frauduleux / arnaque', 'Photos trompeuses', 'Prix abusif', 'Vendeur non réactif', 'Contenu interdit', 'Autre'].map(r => (
                    <button key={r} onClick={() => setReportReason(r)}
                      className={`w-full text-left px-4 py-3 rounded-2xl text-[12px] font-bold transition-all border ${reportReason === r ? 'bg-red-50 border-red-300 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowReportModal(false)}
                    className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-[11px] uppercase">Annuler</button>
                  <button onClick={handleReport} disabled={!reportReason}
                    className="flex-[2] py-4 rounded-2xl bg-red-600 text-white font-black text-[11px] uppercase disabled:opacity-40 active:scale-95 transition-all">
                    Envoyer le signalement
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lightboxOpen && (
        <ImageLightbox images={product.images} initialIndex={lightboxIndex} onClose={() => setLightboxOpen(false)}/>
      )}

      {/* Modal offre de prix */}
      <OfferModal
        product={product}
        visible={showOffer}
        onClose={() => setShowOffer(false)}
        onSend={handleSendOffer}
      />
    </div>
  );
}
