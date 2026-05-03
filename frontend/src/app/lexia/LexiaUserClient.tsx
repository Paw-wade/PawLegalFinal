'use client';

import LexiaClient from '@/app/admin/lexia/LexiaClient';

/** Entrée utilisateur : même UI que l’admin, sans restriction de rôle. */
export default function LexiaUserClient() {
  return <LexiaClient audience="user" />;
}
