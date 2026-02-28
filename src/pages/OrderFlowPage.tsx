// src/pages/OrderFlowPage.tsx
// Flow complet acheteur : Récapitulatif → Paiement → Upload preuve
import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createOrder, submitProof } from '@/services/orderService';
import { uploadToCloudinary } from '@/utils/uploadImage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Product, MOBILE_PAYMENT_METHODS, PaymentInfo } from '@/types';
import { PaymentLogo } from '@/components/PaymentLogo';

interface OrderFlowPageProps {
  product: Product;
  onBack: () => void;
  onOrderCreated: (orderId: string) => void;
  acceptedPrice?: number; // Prix négocié si offre acceptée
}

type Step = 'recap' | 'payment_details' | 'proof';

export function OrderFlowPage({ product, onBack, onOrderCreated, acceptedPrice }: OrderFlowPageProps) {
  const { currentUser, userProfile } = useAuth();
  const [step, setStep] = useState<Step>('recap');
  const [orderId, setOrderId] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'in_person'>('in_person');
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [sellerPayments, setSellerPayments] = useState<PaymentInfo[]>([]);
  const [sellerDelivery, setSellerDelivery] = useState<{ sameZone: number; otherZone: number }>({ sameZone: 0, otherZone: 0 });
  const [loadingSellerInfo, setLoadingSellerInfo] = useState(true);
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Prix effectif = prix négocié ou prix normal
  const effectivePrice = acceptedPrice ?? product.price;
  const fileRef = useRef<HTMLInputElement>(null);




  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Charger les coordonnées de paiement du vendeur depuis Firestore
  React.useEffect(() => {
    const fetchSeller = async () => {
      setLoadingSellerInfo(true);
      try {
        const snap = await getDoc(doc(db, 'users', product.sellerId));
        if (snap.exists()) {
          const data = snap.data();
          setSellerPayments(data.defaultPaymentMethods || []);
          setSellerDelivery({
            sameZone: data.deliveryPriceSameZone || 0,
            otherZone: data.deliveryPriceOtherZone || 0,
          });
        }
      } catch (e) { console.error('[OrderFlow] fetchSeller:', e); }
      finally { setLoadingSellerInfo(false); }
    };
    fetchSeller();
  }, [product.sellerId]);

  const handleStartOrder = async () => {
    if (!currentUser || !userProfile || !paymentInfo) return;
    setLoading(true);
    try {
      const deliveryFee = deliveryType === 'delivery' ? sellerDelivery.otherZone : 0;
      const id = await createOrder({
        buyerId: currentUser.uid,
        buyerName: userProfile.name,
        buyerPhoto: userProfile.photoURL,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        sellerPhoto: product.sellerPhoto,
        productId: product.id,
        productTitle: product.title,
        productImage: product.images?.[0] || '',
        productPrice: effectivePrice,
        deliveryFee,
        paymentInfo,
        deliveryType,
      });
      setOrderId(id);
      setStep('proof');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = ev => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitProof = async () => {
    if (!screenshotPreview || !transactionRef.trim()) return;
    setLoading(true);
    try {
      await submitProof(orderId, {
        screenshotUrl: screenshotPreview, // Base64 pour MVP — Cloudinary en prod
        transactionRef: transactionRef.trim(),
      });
      onOrderCreated(orderId);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const method = MOBILE_PAYMENT_METHODS.find(m => m.id === paymentInfo?.method);

  // ── ÉTAPE 1 : Récapitulatif ────────────────────────────
  if (step === 'recap') return (
    <div className="fixed inset-0 bg-white z-[90] flex flex-col font-sans">
      <div className="flex items-center gap-4 px-5 py-5 border-b border-slate-100">
        <button onClick={onBack} className="w-11 h-11 bg-slate-50 rounded-2xl flex items-center justify-center active:scale-90 transition-all">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" stroke="#0F0F0F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="font-black text-slate-900 text-base uppercase tracking-tight">Finaliser la commande</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {/* Produit */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
            <img src={product.images?.[0]} alt={product.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 text-sm truncate">{product.title}</p>
            <p className="text-green-600 font-black text-lg">{effectivePrice.toLocaleString('fr-FR')} FCFA</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase">{product.sellerName}</p>
          </div>
        </div>

        {/* Détail du prix — frais de livraison si applicable */}
        <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Récapitulatif</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-slate-600 font-medium">Prix de l'article</span>
              <div className="flex items-center gap-2">
                {acceptedPrice && acceptedPrice !== product.price && (
                  <span className="text-[11px] text-slate-400 line-through">{product.price.toLocaleString('fr-FR')}</span>
                )}
                <span className="font-black text-slate-900 text-[13px]">{effectivePrice.toLocaleString('fr-FR')} FCFA</span>
                {acceptedPrice && acceptedPrice !== product.price && (
                  <span className="text-[9px] bg-green-100 text-green-700 font-black px-1.5 py-0.5 rounded-lg">Négocié ✓</span>
                )}
              </div>
            </div>
            {deliveryType === 'delivery' && sellerDelivery.otherZone > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-slate-500 font-medium">Frais de livraison</span>
                <span className="font-bold text-slate-600 text-[12px]">+ {sellerDelivery.otherZone.toLocaleString('fr-FR')} FCFA</span>
              </div>
            )}
            <div className="h-px bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-black text-slate-800 uppercase">Total à envoyer</span>
              <span className="font-black text-green-700 text-[15px]">
                {(effectivePrice + (deliveryType === 'delivery' ? sellerDelivery.otherZone : 0)).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Type de remise */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Mode de remise</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'in_person', label: 'Main propre', icon: '🤝', sub: 'Confirmation immédiate' },
              { id: 'delivery',  label: 'Livraison',   icon: '📦', sub: 'Confirmation sous 6h' },
            ].map(opt => (
              <button key={opt.id}
                onClick={() => setDeliveryType(opt.id as any)}
                className={`p-4 rounded-2xl border-2 text-left transition-all active:scale-95 ${deliveryType === opt.id ? 'border-green-500 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                <p className="text-xl mb-1">{opt.icon}</p>
                <p className={`text-[11px] font-black uppercase tracking-tight ${deliveryType === opt.id ? 'text-green-800' : 'text-slate-700'}`}>{opt.label}</p>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">{opt.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Choix méthode de paiement */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Méthode de paiement du vendeur</p>
          {loadingSellerInfo ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-200 border-t-green-600 rounded-full animate-spin"/>
            </div>
          ) : sellerPayments.length === 0 ? (
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <p className="text-[11px] text-amber-800 font-bold">Le vendeur n'a pas encore renseigné ses coordonnées de paiement. Contactez-le via la messagerie.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sellerPayments.map((pm) => {
                const m = MOBILE_PAYMENT_METHODS.find(x => x.id === pm.method);
                const isSelected = paymentInfo?.method === pm.method && paymentInfo?.phone === pm.phone;
                return (
                  <button key={`${pm.method}-${pm.phone}`}
                    onClick={() => setPaymentInfo(pm)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isSelected ? 'border-green-500 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                    {m && <PaymentLogo logo={m.logo} name={m.name} color={m.color} size={42} />}
                    <div className="flex-1">
                      <p className="font-black text-slate-900 text-[12px]">{m?.name}</p>
                      <p className="text-slate-500 text-[11px] font-bold">{pm.phone} · {pm.holderName}</p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <button
          onClick={() => setStep('payment_details')}
          disabled={!paymentInfo || loading}
          className="w-full py-5 rounded-2xl font-black text-[12px] uppercase tracking-widest text-white shadow-xl shadow-green-200 active:scale-95 transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #16A34A, #115E2E)' }}>
          Continuer → Voir les coordonnées
        </button>
      </div>
    </div>
  );

  // ── ÉTAPE 2 : Coordonnées paiement ─────────────────────
  if (step === 'payment_details') return (
    <div className="fixed inset-0 bg-white z-[90] flex flex-col font-sans">
      <div className="flex items-center gap-4 px-5 py-5 border-b border-slate-100">
        <button onClick={() => setStep('recap')} className="w-11 h-11 bg-slate-50 rounded-2xl flex items-center justify-center active:scale-90 transition-all">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" stroke="#0F0F0F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="font-black text-slate-900 text-base uppercase tracking-tight">Effectuer le paiement</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {/* Montant à envoyer */}
        <div className="text-center py-6 px-4 rounded-3xl"
          style={{ background: `linear-gradient(135deg, ${method?.color}15, ${method?.color}30)` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Montant à envoyer</p>
          <p className="text-4xl font-black text-slate-900">
            {(effectivePrice + (deliveryType === 'delivery' ? sellerDelivery.otherZone : 0)).toLocaleString('fr-FR')}
          </p>
          <p className="text-lg font-black text-slate-600">FCFA</p>
          {deliveryType === 'delivery' && sellerDelivery.otherZone > 0 && (
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              Article {effectivePrice.toLocaleString('fr-FR')} + Livraison {sellerDelivery.otherZone.toLocaleString('fr-FR')} FCFA
            </p>
          )}
        </div>

        {/* Coordonnées */}
        <div className="bg-slate-50 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            {method && <PaymentLogo logo={method.logo} name={method.name} color={method.color} size={36} />}
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Envoyer via {method?.name}</p>
          </div>

          {/* Numéro avec bouton copier */}
          <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-100">
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Numéro {method?.name}</p>
              <p className="font-black text-slate-900 text-xl tracking-wider">{paymentInfo?.phone}</p>
            </div>
            <button
              onClick={() => copyPhone(paymentInfo?.phone || '')}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-90 ${copied ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {copied ? (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>Copié !</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copier</>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-100">
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Nom du titulaire</p>
              <p className="font-black text-slate-900 text-[15px]">{paymentInfo?.holderName}</p>
            </div>
          </div>
        </div>

        {/* Avertissement anti-fraude */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.2" className="flex-shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <p className="text-[10px] font-black text-amber-900 uppercase mb-1">Vérifiez le nom avant d'envoyer</p>
            <p className="text-[10px] text-amber-800 font-medium leading-relaxed">Confirmez que le nom affiché correspond au titulaire Wave/OM avant tout envoi. Brumerie ne rembourse pas les virements sur un mauvais numéro.</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <button onClick={handleStartOrder} disabled={loading}
          className="w-full py-5 rounded-2xl font-black text-[12px] uppercase tracking-widest text-white shadow-xl shadow-blue-200 active:scale-95 transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Création en cours...
            </div>
          ) : "J'ai effectué le paiement →"}
        </button>
      </div>
    </div>
  );

  // ── ÉTAPE 3 : Upload preuve ─────────────────────────────
  return (
    <div className="fixed inset-0 bg-white z-[90] flex flex-col font-sans">
      <div className="flex items-center gap-4 px-5 py-5 border-b border-slate-100">
        <div className="w-11 h-11 bg-green-50 rounded-2xl flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div>
          <h1 className="font-black text-slate-900 text-base uppercase tracking-tight">Preuve de paiement</h1>
          <p className="text-[9px] text-green-600 font-bold uppercase tracking-widest">Commande créée ✓</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-[11px] text-blue-800 font-bold leading-relaxed">
            Uploadez une capture d'écran de votre reçu de transaction et entrez l'ID de transaction. Le vendeur sera notifié immédiatement.
          </p>
        </div>

        {/* Upload screenshot */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Capture d'écran du reçu</p>
          <button onClick={() => fileRef.current?.click()}
            className={`w-full rounded-3xl border-2 border-dashed overflow-hidden transition-all active:scale-98 ${screenshotPreview ? 'border-green-400' : 'border-slate-200 bg-slate-50'}`}
            style={{ minHeight: 160 }}>
            {screenshotPreview ? (
              <img src={screenshotPreview} alt="Preuve" className="w-full object-contain max-h-64" />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Appuyer pour uploader</p>
                <p className="text-[9px] text-slate-300 font-medium">Screenshot Wave / Orange / MTN</p>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* ID transaction */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            ID / Référence de transaction
            <span className="text-red-400 ml-1">*</span>
          </p>
          <input
            type="text"
            value={transactionRef}
            onChange={e => setTransactionRef(e.target.value)}
            placeholder="Ex: TXN-12345678 ou REF-ABCDE"
            className="w-full bg-slate-50 rounded-2xl px-5 py-4 text-[13px] border-2 border-transparent focus:border-blue-400 focus:bg-white outline-none transition-all font-mono tracking-wider"
          />
          <p className="text-[9px] text-slate-400 font-medium mt-2 ml-1">
            Trouvez cet ID dans votre historique de transactions Wave/OM.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <button
          onClick={handleSubmitProof}
          disabled={!screenshotPreview || !transactionRef.trim() || loading}
          className="w-full py-5 rounded-2xl font-black text-[12px] uppercase tracking-widest text-white shadow-xl shadow-green-200 active:scale-95 transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #16A34A, #115E2E)' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Envoi en cours...
            </div>
          ) : 'Envoyer la preuve au vendeur →'}
        </button>
      </div>
    </div>
  );
}
