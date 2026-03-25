'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getUserAvatarDisplayUrl } from '@/lib/profilePhoto';

export type UserAvatarUser = {
  profilePhoto?: string;
  avatarUrl?: string;
  photoUrl?: string;
  firstName?: string;
  lastName?: string;
} | null;

type Props = {
  user: UserAvatarUser;
  /** Contenu affiché si pas d’URL ou si le chargement de l’image échoue (404, réseau, etc.) */
  fallback: ReactNode;
  alt?: string;
  imgClassName?: string;
};

/**
 * Avatar utilisateur avec repli automatique si l’image ne charge pas (fichier manquant, mauvaise URL, etc.).
 */
export function UserAvatarDisplay({ user, fallback, alt = '', imgClassName = 'w-full h-full object-cover' }: Props) {
  const url = user ? getUserAvatarDisplayUrl(user) : null;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [url]);

  if (!url || imgFailed) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={imgClassName} onError={() => setImgFailed(true)} />
  );
}
