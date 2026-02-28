// src/pages/ChatPage.tsx — Chat temps réel Brumerie
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToMessages, sendMessage, sendProductCard,
  markConversationAsRead, reportMessage,
} from '@/services/messagingService';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Conversation, Message, Product } from '@/types';
import { formatPrice } from '@/utils/helpers';

interface ChatPageProps {
  conversation: Conversation;
  onBack: () => void;
  onProductClick?: (product: Product) => void;
}

function timeLabel(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function dateSeparator(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function ChatPage({ conversation, onBack, onProductClick }: ChatPageProps) {
  const { currentUser, userProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [showProductShare, setShowProductShare] = useState(false);
  const [sellerProduct, setSellerProduct] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const otherId = conversation.participants.find(p => p !== currentUser?.uid) || '';
  const otherName = conversation.participantNames?.[otherId] || 'Utilisateur';
  const otherPhoto = conversation.participantPhotos?.[otherId];
  const isSeller = currentUser?.uid === conversation.participants[1];

  // Charger le produit pour le vendeur (pour le partager)
  useEffect(() => {
    if (!isSeller) return;
    getDoc(doc(db, 'products', conversation.productId)).then(snap => {
      if (snap.exists()) setSellerProduct({ id: snap.id, ...snap.data() });
    });
  }, [conversation.productId, isSeller]);

  // Abonnement messages temps réel
  useEffect(() => {
    const unsub = subscribeToMessages(conversation.id, msgs => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return unsub;
  }, [conversation.id]);

  // Marquer comme lu à l'ouverture
  useEffect(() => {
    if (currentUser) markConversationAsRead(conversation.id, currentUser.uid);
  }, [conversation.id, currentUser]);

  const handleSend = async () => {
    if (!text.trim() || !currentUser || !userProfile || sending) return;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      await sendMessage(conversation.id, currentUser.uid, userProfile.name, msg, userProfile.photoURL);
    } catch (e) { console.error(e); setText(msg); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  const handleShareProduct = async () => {
    if (!currentUser || !userProfile || !sellerProduct) return;
    setShowProductShare(false);
    await sendProductCard(
      conversation.id, currentUser.uid, userProfile.name,
      {
        id: sellerProduct.id,
        title: sellerProduct.title,
        price: sellerProduct.price,
        image: sellerProduct.images?.[0] || '',
        neighborhood: sellerProduct.neighborhood,
      },
      userProfile.photoURL,
    );
  };

  const handleReport = async (msgId: string) => {
    if (reportedIds.has(msgId)) return;
    if (!confirm('Signaler ce message à Brumerie ?')) return;
    await reportMessage(conversation.id, msgId);
    setReportedIds(prev => new Set([...prev, msgId]));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Grouper par date pour séparateurs
  let lastDate = '';

  return (
    <div className="fixed inset-0 bg-white z-[80] flex flex-col font-sans">

      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 active:scale-90 transition-all flex-shrink-0">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" stroke="#0F0F0F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Avatar + nom */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
            {otherPhoto ? (
              <img src={otherPhoto} alt={otherName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-green-50">
                <span className="text-green-700 font-black">{otherName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 text-sm truncate">{otherName}</p>
            <p className="text-[9px] text-green-600 font-bold uppercase tracking-widest truncate">{conversation.productTitle}</p>
          </div>
        </div>

        {/* Miniature produit */}
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0">
          {conversation.productImage ? (
            <img src={conversation.productImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            </div>
          )}
        </div>
      </div>

      {/* Zone messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
        style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)' }}>
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUser?.uid;
          const isSystem = msg.senderId === 'system';
          const msgDate = dateSeparator(msg.createdAt);
          const showSeparator = msgDate !== lastDate;
          lastDate = msgDate;

          return (
            <React.Fragment key={msg.id}>
              {/* Séparateur de date */}
              {showSeparator && (
                <div className="flex items-center justify-center my-4">
                  <div className="bg-slate-100 px-4 py-1.5 rounded-full">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{msgDate}</p>
                  </div>
                </div>
              )}

              {/* Message système */}
              {isSystem && (
                <div className="flex justify-center my-2">
                  <div className="bg-green-50 border border-green-100 px-4 py-2 rounded-2xl max-w-[85%]">
                    <p className="text-[10px] text-green-700 font-medium text-center leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              )}

              {/* Message normal */}
              {!isSystem && (
                <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>

                  {/* Avatar expéditeur (côté gauche) */}
                  {!isMe && (
                    <div className="w-7 h-7 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 mb-1">
                      {msg.senderPhoto ? (
                        <img src={msg.senderPhoto} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-green-50">
                          <span className="text-green-700 font-black text-[10px]">{msg.senderName?.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`group max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>

                    {/* Fiche produit partagée */}
                    {msg.type === 'product_card' && msg.productRef && (
                      <div className={`mb-1 rounded-[1.5rem] overflow-hidden border shadow-sm w-full ${isMe ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-white'}`}>
                        <div className="flex items-center gap-3 p-3">
                          {msg.productRef.image && (
                            <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                              <img src={msg.productRef.image} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-900 truncate">{msg.productRef.title}</p>
                            <p className="text-[10px] font-bold text-green-600">{msg.productRef.price?.toLocaleString('fr-FR')} FCFA</p>
                            <p className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 00-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 00-8-8z"/></svg>
                              {msg.productRef.neighborhood}
                            </p>
                          </div>
                        </div>
                        <div className={`px-3 pb-2 text-[10px] font-bold ${isMe ? 'text-blue-500' : 'text-green-600'}`}>
                          📦 Fiche produit partagée
                        </div>
                      </div>
                    )}

                    {/* Bulle de message */}
                    <div className={`px-4 py-3 rounded-[1.5rem] shadow-sm ${
                      isMe
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-white text-slate-900 border border-slate-100 rounded-bl-md'
                    }`}>
                      <p className="text-[13px] leading-relaxed">{msg.text}</p>
                      <div className={`flex items-center justify-end gap-1.5 mt-1 ${isMe ? 'text-blue-200' : 'text-slate-300'}`}>
                        <span className="text-[9px] font-bold">{timeLabel(msg.createdAt)}</span>
                        {/* Statut lu (seulement pour mes messages) */}
                        {isMe && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke={msg.readBy?.length > 1 ? (isMe ? '#93C5FD' : '#16A34A') : 'currentColor'}
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            {msg.readBy?.length > 1
                              ? <><path d="M1 12l4 4L15 6"/><path d="M8 12l4 4L23 6"/></>
                              : <path d="M20 6L9 17l-5-5"/>
                            }
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Bouton signaler (apparaît au survol/tap) */}
                    {!isMe && !reportedIds.has(msg.id) && (
                      <button onClick={() => handleReport(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-[9px] text-slate-300 font-bold uppercase tracking-widest flex items-center gap-1">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Signaler
                      </button>
                    )}
                    {reportedIds.has(msg.id) && (
                      <p className="text-[9px] text-orange-400 font-bold mt-1">Signalé ✓</p>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Barre d'envoi */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 flex-shrink-0">
        {/* Bouton partager fiche produit (vendeur seulement) */}
        {isSeller && sellerProduct && (
          <button onClick={handleShareProduct}
            className="w-full flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3 mb-3 active:scale-98 transition-all">
            <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
              <img src={sellerProduct.images?.[0]} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[10px] font-black text-green-800 truncate">{sellerProduct.title}</p>
              <p className="text-[9px] text-green-600 font-bold">{sellerProduct.price?.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div className="flex items-center gap-1 text-green-600 text-[9px] font-black uppercase tracking-widest flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
              </svg>
              Partager
            </div>
          </button>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Écris un message..."
            className="flex-1 bg-slate-50 rounded-2xl px-5 py-4 text-[13px] border-2 border-transparent focus:border-blue-400 focus:bg-white outline-none transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 disabled:opacity-30 active:scale-90 transition-all flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
