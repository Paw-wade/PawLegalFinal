'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export function GuidePopup() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [popupVisible, setPopupVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [btnVisible, setBtnVisible] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;

    // Bouton flottant : visible sauf si deja ferme cette session
    try {
      if (!sessionStorage.getItem('ada_guide_btn_closed')) {
        setBtnVisible(true);
      }
    } catch { /* rien */ }

    // Popup : visible seulement si jamais ferme definitivement
    try {
      if (localStorage.getItem('ada_guide_popup_v2')) return;
    } catch { /* rien */ }

    const t = setTimeout(() => {
      setPopupVisible(true);
      requestAnimationFrame(() => setMounted(true));
    }, 900);
    return () => clearTimeout(t);
  }, [status]);

  const dismissPopup = () => {
    setMounted(false);
    setTimeout(() => setPopupVisible(false), 300);
  };

  const dismissPopupForever = () => {
    setMounted(false);
    setTimeout(() => setPopupVisible(false), 300);
    try { localStorage.setItem('ada_guide_popup_v2', '1'); } catch { /* rien */ }
  };

  const dismissBtn = () => {
    setBtnVisible(false);
    try { sessionStorage.setItem('ada_guide_btn_closed', '1'); } catch { /* rien */ }
  };

  const goToGuide = () => {
    dismissPopup();
    router.push('/guides/nouvel-arrivant');
  };

  return (
    <>
      {/* Bouton flottant — masque quand le popup est ouvert ou sur Paw AI */}
      {btnVisible && !popupVisible && pathname !== '/lexia' && pathname !== '/guides/nouvel-arrivant' && (
        <div
          style={{
            position: 'fixed',
            bottom: '84px',
            right: '24px',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <button
            onClick={goToGuide}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              padding: '10px 16px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(234,88,12,0.45)',
              transition: 'opacity 0.15s, transform 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            Guide nouvel arrivant
          </button>

          <button
            onClick={dismissBtn}
            aria-label="Fermer"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.25)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.45)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.25)')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Popup */}
      {popupVisible && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) dismissPopup(); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: mounted ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            backdropFilter: mounted ? 'blur(4px)' : 'none',
            transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
              transform: mounted ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
              opacity: mounted ? 1 : 0,
              transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
            }}
          >
            {/* Image en fond plein */}
            <div style={{ position: 'relative', height: 'min(260px, 38vh)' }}>
              <img
                src="/photo%20guide%20nouvel%20arrivant.jpg"
                alt="Étudiants internationaux"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
              />

              {/* Gradient sombre sur le bas pour lisibilité */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.72) 100%)',
              }} />

              {/* Bande orange en haut */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  background: 'rgba(234,88,12,0.92)', padding: '4px 12px',
                  borderRadius: '999px', letterSpacing: '0.02em', whiteSpace: 'nowrap',
                }}>
                  Guide gratuit du nouvel arrivant
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Ada Papers
                </span>
              </div>

              {/* Texte superposé sur l'image (bas) */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 22px 22px' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,220,180,1)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Arrivé récemment en France ?
                </p>
                <h2 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', lineHeight: 1.15, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                  Toutes vos démarches,<br />
                  <span style={{ color: '#fb923c' }}>étape par étape.</span>
                </h2>
              </div>
            </div>

            {/* Bloc contenu bas */}
            <div style={{ background: '#fff', padding: '20px 22px 22px' }}>
              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {['Visa & titre de séjour', 'Sécurité sociale', 'Logement & APL', 'Compte bancaire', 'Mutuelle'].map((tag) => (
                  <span key={tag} style={{
                    fontSize: '11px', fontWeight: 600, color: '#ea580c',
                    background: '#fff7ed', border: '1px solid #fed7aa',
                    padding: '3px 10px', borderRadius: '999px',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>

              <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6, marginBottom: '18px' }}>
                Notre guide récapitule les démarches administratives à effectuer dès votre arrivée en France.
              </p>

              {/* Boutons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={goToGuide}
                  style={{
                    flex: 1, background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    padding: '12px 16px', borderRadius: '12px', border: 'none',
                    cursor: 'pointer', boxShadow: '0 4px 14px rgba(234,88,12,0.35)', transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Consulter le guide →
                </button>
                <button
                  onClick={dismissPopup}
                  style={{
                    padding: '12px 14px', borderRadius: '12px', border: '1px solid #e5e7eb',
                    background: '#fff', color: '#9ca3af', fontSize: '12px', fontWeight: 500,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  Plus tard
                </button>
              </div>

              {/* Ne plus afficher */}
              <button
                onClick={dismissPopupForever}
                style={{
                  marginTop: '10px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '11px', color: '#d1d5db',
                  textDecoration: 'underline', textDecorationStyle: 'dotted',
                  padding: 0, width: '100%', textAlign: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#9ca3af')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#d1d5db')}
              >
                Ne plus afficher ce message
              </button>
            </div>

            {/* Croix fermer */}
            <button
              onClick={dismissPopup}
              aria-label="Fermer"
              style={{
                position: 'absolute', top: '12px', right: '12px',
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.35)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.35)')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
