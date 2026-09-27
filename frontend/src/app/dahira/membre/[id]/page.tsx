'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { getApiBaseUrl } from '@/lib/api';

interface Membre {
  _id: string;
  photo?: string;
  nom: string;
  prenom: string;
  sexe: 'H' | 'F' | '';
  categorieMembre: 'actif' | 'adherent' | 'sympathisant';
  statutAnciennete: 'nouveau' | '1_3_ans' | 'plus_3_ans';
  dateAdhesionApprox?: string;
  createdAt: string;
}

const CATEGORIE_LABEL: Record<string, string> = {
  actif: 'Membre actif',
  adherent: 'Adherent',
  sympathisant: 'Sympathisant',
};

const ANCIENNETE_LABEL: Record<string, string> = {
  nouveau: 'Nouveau membre',
  '1_3_ans': '1 a 3 ans',
  plus_3_ans: 'Plus de 3 ans',
};

export default function MembrePage() {
  const { id } = useParams<{ id: string }>();
  const [membre, setMembre] = useState<Membre | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${getApiBaseUrl()}/dahira/membres/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMembre(data.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f4a29] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !membre) {
    return (
      <div className="min-h-screen bg-[#0f4a29] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Image src="/Logo dahira.jpeg" alt="Dahira" width={72} height={72} className="rounded-full opacity-60" />
        <p className="text-white/60 text-sm">Fiche introuvable</p>
      </div>
    );
  }

  const annee = membre.dateAdhesionApprox
    ? membre.dateAdhesionApprox.slice(0, 4)
    : new Date(membre.createdAt).getFullYear().toString();

  const titre = membre.sexe === 'H' ? 'Seugn' : membre.sexe === 'F' ? 'Soxna' : '';

  return (
    <div className="min-h-screen bg-[#0f4a29] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-gradient-to-br from-[#0f4a29] to-[#1e7d45] rounded-2xl border border-[#c8a84b]/20 shadow-2xl overflow-hidden">
        <div className="flex flex-col items-center pt-8 pb-6 px-6 gap-4">
          <Image src="/Logo dahira.jpeg" alt="Dahira Sahadatou Mouridina" width={64} height={64} className="rounded-full border-2 border-[#c8a84b]/50" />
          <p className="text-[#c8a84b] text-xs uppercase tracking-widest text-center leading-relaxed">
            Dahira Sahadatou Mouridina
          </p>

          <div className="flex flex-col items-center gap-2">
            {membre.photo ? (
              <img
                src={membre.photo}
                alt={`${membre.prenom} ${membre.nom}`}
                className="w-24 h-24 rounded-full object-cover border-2 border-[#c8a84b]"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-2 border-[#c8a84b]/40 bg-white/10 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="19" r="10" fill="rgba(255,255,255,0.5)" />
                  <ellipse cx="24" cy="38" rx="17" ry="10" fill="rgba(255,255,255,0.3)" />
                </svg>
              </div>
            )}
            <h1 className="text-white text-xl font-semibold text-center">
              {titre && <span className="text-[#c8a84b] mr-1">{titre}</span>}
              {membre.prenom} {membre.nom}
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c8a84b] bg-[#c8a84b]/10 border border-[#c8a84b]/30 px-3 py-0.5 rounded-full">
              {CATEGORIE_LABEL[membre.categorieMembre]}
            </span>
          </div>

          <div className="w-full border-t border-white/10 pt-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Anciennete</span>
              <span className="text-sm text-white/80">{ANCIENNETE_LABEL[membre.statutAnciennete]}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Membre depuis</span>
              <span className="text-sm text-white/80">{annee}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0a3a20] px-6 py-3 text-center">
          <p className="text-[10px] text-white/30 uppercase tracking-widest">
            Fiche officielle de la Dahira
          </p>
        </div>
      </div>
    </div>
  );
}
