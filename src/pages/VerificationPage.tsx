// src/pages/VerificationPage.tsx — Sprint 7 : Pricing vertical 3 cartes
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { VERIFICATION_PRICE, SUPPORT_WHATSAPP } from '@/types';

interface VerificationPageProps { onBack: () => void; }

export function VerificationPage({ onBack }: VerificationPageProps) {
  const { userProfile } = useAuth();
  const [sent, setSent] = useState(false);

  const tier = userProfile?.isPremium ? 'premium' : userProfile?.isVerified ? 'verified' : 'simple';

  const handleActivate = () => {
    if (!userProfile) return;
    const msg = `Bonjour Brumerie ! 👋\n\nJe veux activer le *Badge Vérifié* (1er mois gratuit).\n\n👤 Nom : ${userProfile.name}\n📧 Email : ${userProfile.email}\n📱 Tel : ${userProfile.phone || 'non renseigné'}`;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
    setSent(true);
  };

  const handleWaitlist = () => {
    if (!userProfile) return;
    const msg = `Bonjour Brumerie ! 👋\n\nJe veux m'inscrire sur la liste d'attente pour le *Badge Premium*.\n\n👤 Nom : ${userProfile.name}`;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="min-h-screen pb-20 font-sans" style={{ background: '#F0F4FF' }}>

      {/* Header */}
      <div className="bg-white sticky top-0 z-50 px-5 py-5 flex items-center gap-4 border-b border-slate-100">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-slate-50 active:scale-90 transition-all">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" stroke="#0F0F0F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div>
          <h1 className="font-black text-sm uppercase tracking-widest text-slate-900">Identité Vérifiable</h1>
          <p className="text-[9px] text-slate-400 font-bold mt-0.5">Le badge indique que l'identité a été contrôlée par Brumerie</p>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-4">

        {/* ── CARTE SIMPLE ── */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Simple</p>
          <p className="text-4xl font-black text-slate-300 mb-1">0 <span className="text-xl">FCFA</span></p>
          <p className="text-[10px] text-slate-400 mb-5">Pour tester l'application</p>

          <div className="space-y-3">
            {[
              { icon: '❌', bold: 'Aucun badge', rest: 'd\'identité vérifiée' },
              { icon: '📸', bold: null, rest: 'Photos réelles uniquement' },
              { icon: '📍', bold: null, rest: 'Visibilité Normale' },
              { icon: '💬', bold: null, rest: 'Max 5 chats / jour' },
              { icon: '🏠', bold: null, rest: 'Page boutique standard' },
              { icon: '📊', bold: null, rest: 'Aucune statistique', muted: true },
              { icon: '📦', bold: null, rest: 'Max 5 produits' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-base w-6 text-center flex-shrink-0">{f.icon}</span>
                <p className={`text-[12px] font-medium ${f.muted ? 'text-slate-300' : 'text-slate-600'}`}>
                  {f.bold && <strong className="text-slate-800">{f.bold} </strong>}
                  {f.rest}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-slate-100 rounded-2xl py-4 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {tier === 'simple' ? '— Gratuit —' : 'Plan de base'}
            </p>
          </div>
        </div>

        {/* ── CARTE VÉRIFIÉ — principale ── */}
        <div className="rounded-3xl overflow-visible relative"
          style={{ boxShadow: '0 20px 60px rgba(29,155,240,0.25)', border: '2px solid #1D9BF0' }}>

          {/* Badge recommandé */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-widest px-5 py-1.5 rounded-full shadow-lg whitespace-nowrap">
              🔥 RECOMMANDÉ POUR VOUS !
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 pt-8">
            <p className="font-black uppercase tracking-widest mb-2" style={{ color: '#1D9BF0' }}>Vérifié</p>

            {/* Prix barré + nouveau */}
            <div className="flex items-baseline gap-3 mb-1">
              <p className="text-slate-300 line-through text-lg font-bold">3000</p>
              <p className="text-5xl font-black text-slate-900">2000 <span className="text-xl font-bold">FCFA</span></p>
            </div>
            <p className="text-[10px] text-slate-400 mb-5">Visibilité accrue · Identité contrôlée</p>

            <div className="space-y-3">
              {[
                { icon: '✅', bold: 'Badge Bleu', rest: '"Vérifié"' },
                { icon: '📸', bold: null, rest: 'Photos réelles + Catalogue' },
                { icon: '🚀', bold: null, rest: 'Visibilité ', boldEnd: 'Boostée (+20%)' },
                { icon: '💬', bold: null, rest: 'Messagerie ', boldEnd: 'Illimitée' },
                { icon: '🌐', bold: null, rest: 'Bio + Liens réseaux sociaux' },
                { icon: '📊', bold: null, rest: 'Stats de vues de base' },
                { icon: '📦', bold: null, rest: 'Max ', boldEnd: '20 produits' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base w-6 text-center flex-shrink-0">{f.icon}</span>
                  <p className="text-[12px] font-medium text-slate-600">
                    {f.bold && <strong className="text-slate-900">{f.bold} </strong>}
                    {f.rest}
                    {f.boldEnd && <strong className="text-slate-900">{f.boldEnd}</strong>}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {tier === 'verified' ? (
                <div className="rounded-2xl py-4 text-center" style={{ background: '#EFF6FF' }}>
                  <p className="font-black text-[11px] uppercase tracking-widest" style={{ color: '#1D9BF0' }}>✓ Badge actif</p>
                </div>
              ) : tier === 'simple' ? (
                <>
                  {sent ? (
                    <div className="rounded-2xl py-4 text-center bg-slate-900">
                      <p className="text-white font-black text-[11px] uppercase">📱 WhatsApp ouvert !</p>
                      <p className="text-slate-400 text-[9px] mt-1">Envoie le message pour activer</p>
                    </div>
                  ) : (
                    <button onClick={handleActivate}
                      className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[12px] text-white active:scale-[0.98] transition-all"
                      style={{ background: '#1D9BF0', boxShadow: '0 10px 30px rgba(29,155,240,0.4)' }}>
                      ACTIVER (1 MOIS OFFERT)
                    </button>
                  )}
                  <p className="text-center text-amber-500 font-black text-[10px]">✨ Cadeau : +30 jours gratuits !</p>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── 🏅CARTE PREMIUM ── */}
        <div className="rounded-3xl p-6 pb-8" style={{ background: '#0F0F0F' }}>
          <p className="font-black uppercase tracking-widest mb-2" style={{ color: '#F59E0B' }}>Premium</p>
          <p className="text-5xl font-black text-white mb-1">Bientôt</p>
          <p className="text-[10px] mb-5" style={{ color: '#78716C' }}>L'élite du e-commerce local</p>

          <div className="space-y-3">
            {[
              { icon: '👑', bold: 'Badge Or', rest: '"Premium"' },
              { icon: '🎬', bold: null, rest: 'Photos Studio + Vidéos' },
              { icon: '🥇', bold: 'Priorité Max', rest: ' (Top Page)' },
              { icon: '🤖', bold: null, rest: 'Illimitée + Auto-réponse' },
              { icon: '🎨', bold: null, rest: 'Boutique 100% Personnalisée' },
              { icon: '📈', bold: null, rest: 'Analyse détaillée des ventes' },
              { icon: '📦', bold: 'Produits Illimités', rest: '' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-base w-6 text-center flex-shrink-0">{f.icon}</span>
                <p className="text-[12px] font-medium" style={{ color: '#A8A29E' }}>
                  {f.bold && <strong style={{ color: '#F59E0B' }}>{f.bold}</strong>}
                  {f.rest}
                </p>
              </div>
            ))}
          </div>

          <button onClick={handleWaitlist}
            className="mt-6 w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-white text-slate-900 active:scale-[0.98] transition-all">
            S'INSCRIRE À L'ATTENTE
          </button>
        </div>

      </div>
    </div>
  );
}
