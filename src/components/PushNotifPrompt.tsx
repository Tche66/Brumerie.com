// src/components/PushNotifPrompt.tsx
// Invite l'utilisateur à activer les notifications push au bon moment
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPushSupported, getPushPermission, subscribeToPush, isPushSubscribed } from '@/services/pushService';

export function PushNotifPrompt() {
  const { currentUser, userProfile } = useAuth();
  const [show, setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone]   = useState(false);

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    if (!isPushSupported()) return;
    if (getPushPermission() !== 'default') return; // déjà répondu

    // Afficher après 30s sur le site (pas au chargement — trop intrusif)
    const timer = setTimeout(async () => {
      const alreadySubscribed = await isPushSubscribed(currentUser.uid);
      if (!alreadySubscribed) setShow(true);
    }, 30_000);

    return () => clearTimeout(timer);
  }, [currentUser, userProfile]);

  if (!show || done) return null;

  const handleAccept = async () => {
    setLoading(true);
    const ok = await subscribeToPush(currentUser!.uid, userProfile?.neighborhood || '');
    setLoading(false);
    setDone(true);
    setShow(false);
    if (ok) {
      // Petit toast de confirmation géré par le parent
    }
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[150] max-w-sm mx-auto"
      style={{ animation: 'slideUp 0.4s ease-out' }}>
      <div className="bg-slate-900 rounded-[2.5rem] p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl">
            🔔
          </div>
          <div className="flex-1">
            <p className="font-black text-white text-[13px] mb-1">
              Nouveaux articles dans ton quartier
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Reçois une alerte quand un article est publié près de chez toi.
            </p>
          </div>
          <button onClick={() => setShow(false)}
            className="text-slate-500 text-[18px] leading-none flex-shrink-0 -mt-1">×</button>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleAccept} disabled={loading}
            className="flex-1 py-3.5 bg-green-500 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all disabled:opacity-60">
            {loading ? '…' : '✓ Activer'}
          </button>
          <button onClick={() => setShow(false)}
            className="flex-1 py-3.5 bg-white/10 text-slate-300 font-bold text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
            Plus tard
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform:translateY(30px);opacity:0 } to { transform:translateY(0);opacity:1 } }`}</style>
    </div>
  );
}
