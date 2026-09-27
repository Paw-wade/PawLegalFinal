'use client';

import { QRCodeSVG } from 'qrcode.react';

interface Props {
  id: string;
  prenom: string;
  nom: string;
  sexe?: 'H' | 'F' | '';
  photo?: string;
  categorieMembre: 'actif' | 'adherent' | 'sympathisant';
  dateAdhesionApprox?: string;
  anneeCreation?: string;
}

const CATEGORIE_LABEL: Record<string, string> = {
  actif: 'Membre actif',
  adherent: 'Adherent',
  sympathisant: 'Sympathisant',
};

const SITE_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL || 'https://adapapers.fr';

const LEFT_W = 136;
const CARD_W = 340;
const CARD_H = 210;
const RIGHT_W = CARD_W - LEFT_W; // 204

export default function DahiraMembreCard({
  id,
  prenom,
  nom,
  photo,
  categorieMembre,
  dateAdhesionApprox,
  anneeCreation,
}: Props) {
  const membreUrl = `${SITE_URL}/dahira/membre/${id}`;
  const annee = dateAdhesionApprox?.slice(0, 4) || anneeCreation || '';
  const fullName = `${prenom} ${nom}`;
  const nameFontSize = fullName.length > 18 ? 13 : fullName.length > 14 ? 15 : 17;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        background: 'linear-gradient(135deg, #0f4a29 0%, #1a6b3c 55%, #1e7d45 100%)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(200,168,75,0.2)',
        fontFamily: 'Inter, system-ui, sans-serif',
        flexShrink: 0,
      }}
    >
      {/* Decoration circle */}
      <div
        style={{
          position: 'absolute',
          right: -30,
          top: -30,
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: '40px solid rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }}
      />

      {/* Left column — fixed width, no overflow */}
      <div
        style={{
          width: LEFT_W,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '16px 12px',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Photo */}
        <div
          style={{
            width: 72,
            height: 72,
            minHeight: 72,
            borderRadius: '50%',
            border: '2px solid #c8a84b',
            overflow: 'hidden',
            background: 'rgba(200,168,75,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {photo ? (
            <img
              src={photo}
              alt={`${prenom} ${nom}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <circle cx="19" cy="15" r="8" fill="rgba(255,255,255,0.55)" />
              <ellipse cx="19" cy="30" rx="13" ry="8" fill="rgba(255,255,255,0.35)" />
            </svg>
          )}
        </div>

        {/* Category badge — constrained to column width */}
        <div
          style={{
            maxWidth: LEFT_W - 24,
            width: 'fit-content',
            boxSizing: 'border-box',
            padding: '2px 8px',
            borderRadius: 10,
            border: '1px solid rgba(200,168,75,0.3)',
            background: 'rgba(200,168,75,0.12)',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 8.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#c8a84b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: LEFT_W - 40,
            }}
          >
            {CATEGORIE_LABEL[categorieMembre]}
          </span>
        </div>
      </div>

      {/* Vertical divider */}
      <div
        style={{
          position: 'absolute',
          left: LEFT_W,
          top: 20,
          bottom: 20,
          width: 1,
          background: 'linear-gradient(to bottom, transparent, rgba(200,168,75,0.35), transparent)',
          zIndex: 1,
        }}
      />

      {/* Right column */}
      <div
        style={{
          width: RIGHT_W,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '14px 14px 13px 18px',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Top row: org name + logo */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          <p
            style={{
              fontSize: 8,
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              lineHeight: 1.4,
              margin: 0,
              flexShrink: 1,
            }}
          >
            Dahira<br />Sahadatou<br />Mouridina
          </p>
          <div
            style={{
              width: 34,
              height: 34,
              minWidth: 34,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '1.5px solid rgba(200,168,75,0.4)',
              background: 'rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Logo dahira.jpeg"
              alt="logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>

        {/* Name — never overflows right column */}
        <div
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: nameFontSize,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.25,
            letterSpacing: '0.01em',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            maxWidth: RIGHT_W - 32,
          }}
        >
          {fullName}
        </div>

        {/* Bottom row: year + QR */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {annee ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.45)' }}>Adhesion depuis</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{annee}</span>
            </div>
          ) : <div />}

          <div
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              background: '#fff',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
              flexShrink: 0,
            }}
          >
            <QRCodeSVG value={membreUrl} size={40} fgColor="#0f4a29" bgColor="#ffffff" level="M" />
          </div>
        </div>
      </div>
    </div>
  );
}
