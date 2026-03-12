'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cmsAPI, mediaAPI } from '@/lib/api';

type SlideType = 'image' | 'video';

type HeroSlide = {
  id: string;
  type: SlideType;
  src: string;
  alt?: string;
};

type CmsEntry = {
  _id: string;
  key: string;
  value: string;
  page?: string;
  section?: string;
  status?: 'draft' | 'published' | 'archived';
};

export default function AdminCarouselPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [cmsEntry, setCmsEntry] = useState<CmsEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const fileInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') {
      router.push('/client');
      return;
    }
    loadCarousel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  const loadCarousel = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await cmsAPI.listEntries({
        page: 'home',
        section: 'hero',
        search: 'home.hero.carousel',
        limit: 5,
      });

      const entries = (res.data?.entries || []) as CmsEntry[];
      const entry =
        entries.find((e) => e.key === 'home.hero.carousel' && e.status !== 'archived') ||
        entries.find((e) => e.key === 'home.hero.carousel') ||
        null;

      setCmsEntry(entry);

      if (entry?.value) {
        try {
          const parsed = JSON.parse(entry.value);
          if (Array.isArray(parsed)) {
            const normalized: HeroSlide[] = parsed
              .map((item: any, index: number): HeroSlide | null => {
                if (!item || typeof item.src !== 'string' || !item.src.trim()) return null;
                const type: SlideType =
                  item.type === 'video' ? 'video' : 'image';
                return {
                  id: item.id || `slide-${index}`,
                  type,
                  src: item.src,
                  alt: item.alt || '',
                };
              })
              .filter((s): s is HeroSlide => s !== null);

            if (normalized.length > 0) {
              setSlides(normalized);
              return;
            }
          }
        } catch {
          // JSON invalide : on tombera sur le fallback ci-dessous
        }
      }

      // Fallback : quelques slides vides prêts à être complétés
      setSlides([
        {
          id: 'slide-1',
          type: 'image',
          src: '',
          alt: '',
        },
      ]);
    } catch (e: any) {
      console.error('Erreur chargement carrousel CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors du chargement du carrousel');
    } finally {
      setLoading(false);
    }
  };

  const handleSlideChange = (index: number, field: keyof HeroSlide, value: string) => {
    setSlides((prev) =>
      prev.map((slide, i) =>
        i === index
          ? {
              ...slide,
              [field]:
                field === 'type'
                  ? (value as SlideType)
                  : value,
            }
          : slide
      )
    );
  };

  const addSlide = () => {
    setSlides((prev) => [
      ...prev,
      {
        id: `slide-${Date.now()}`,
        type: 'image',
        src: '',
        alt: '',
      },
    ]);
  };

  const removeSlide = (index: number) => {
    setSlides((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    setSlides((prev) => {
      const newSlides = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newSlides.length) return prev;
      const temp = newSlides[index];
      newSlides[index] = newSlides[targetIndex];
      newSlides[targetIndex] = temp;
      return newSlides;
    });
  };

  const handleSelectFileClick = (index: number) => {
    const input = fileInputsRef.current[index];
    if (input) {
      input.click();
    }
  };

  const handleFileChange = async (index: number, file: File | null) => {
    if (!file) return;
    try {
      setUploadingIndex(index);
      setError(null);
      const res = await mediaAPI.uploadHeroMedia(file);
      if (!res.data?.success || !res.data.url) {
        setError(res.data?.message || "Erreur lors de l'upload du média.");
        return;
      }
      const mediaType = res.data.type === 'video' ? 'video' : 'image';
      setSlides((prev) =>
        prev.map((slide, i) =>
          i === index
            ? {
                ...slide,
                type: mediaType,
                src: res.data.url,
                alt: slide.alt || file.name,
              }
            : slide
        )
      );
    } catch (e: any) {
      console.error('Erreur upload média hero:', e);
      setError(
        e?.response?.data?.message ||
          "Erreur lors du téléversement du média. Vérifiez le format et la taille."
      );
    } finally {
      setUploadingIndex(null);
      // Réinitialiser la valeur de l'input pour pouvoir re-sélectionner le même fichier si besoin
      const input = fileInputsRef.current[index];
      if (input) {
        input.value = '';
      }
    }
  };

  const saveCarousel = async () => {
    const cleanedSlides = slides
      .map((s) => ({
        id: s.id || `slide-${Math.random().toString(36).slice(2)}`,
        type: s.type,
        src: s.src.trim(),
        alt: s.alt?.trim() || '',
      }))
      .filter((s) => s.src);

    if (cleanedSlides.length === 0) {
      setError('Ajoutez au moins une image ou une vidéo avec une URL.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = JSON.stringify(cleanedSlides);

      if (cmsEntry) {
        const res = await cmsAPI.updateEntry(cmsEntry._id, {
          value: payload,
          description: 'Configuration du carrousel de la section hero (images/vidéos).',
          page: 'home',
          section: 'hero',
          status: 'published',
        });
        setCmsEntry(res.data?.entry || cmsEntry);
      } else {
        const res = await cmsAPI.createEntry({
          key: 'home.hero.carousel',
          value: payload,
          page: 'home',
          section: 'hero',
          description: 'Configuration du carrousel de la section hero (images/vidéos).',
        });
        setCmsEntry(res.data?.entry || null);
        if (res.data?.entry?._id) {
          await cmsAPI.publishEntry(res.data.entry._id);
        }
      }
    } catch (e: any) {
      console.error('Erreur sauvegarde carrousel CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors de la sauvegarde du carrousel');
    } finally {
      setSaving(false);
    }
  };

  const role = (session?.user as any)?.role;
  const isAuthorized = role === 'admin' || role === 'superadmin';

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!session || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Gestion du carrousel de la page d&apos;accueil
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Configurez les slides du carrousel du hero : chaque slide peut être une image ou une
            vidéo. Le carrousel utilise ces éléments au lieu des visuels par défaut.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Pour une <span className="font-semibold">vidéo</span>, utilisez une URL directe vers un
            fichier (mp4, webm...) ou un lien public compatible avec la balise HTML
            <code className="mx-1 px-1 rounded bg-gray-100 text-[11px]">&lt;video&gt;</code>.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Chargement du carrousel...
          </div>
        ) : (
          <div className="space-y-4">
            {slides.map((slide, index) => (
              <div
                key={slide.id || index}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Slide {index + 1}
                    </span>
                    <select
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                      value={slide.type}
                      onChange={(e) => handleSlideChange(index, 'type', e.target.value)}
                    >
                      <option value="image">Image</option>
                      <option value="video">Vidéo</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveSlide(index, 'up')}
                      disabled={index === 0}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(index, 'down')}
                      disabled={index === slides.length - 1}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlide(index)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      URL {slide.type === 'video' ? 'de la vidéo' : "de l'image"}
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder={
                        slide.type === 'video'
                          ? 'https://.../video.mp4'
                          : 'https://.../image.jpg'
                      }
                      value={slide.src}
                      onChange={(e) => handleSlideChange(index, 'src', e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectFileClick(index)}
                        className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        disabled={uploadingIndex === index}
                      >
                        {uploadingIndex === index
                          ? 'Téléversement...'
                          : 'Choisir un fichier sur cet ordinateur'}
                      </button>
                      <input
                        ref={(el) => {
                          fileInputsRef.current[index] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg"
                        className="hidden"
                        onChange={(e) =>
                          handleFileChange(index, e.target.files?.[0] || null)
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Texte alternatif (accessibilité)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Court texte décrivant le visuel"
                      value={slide.alt || ''}
                      onChange={(e) => handleSlideChange(index, 'alt', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={addSlide}
                className="inline-flex items-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Ajouter un slide
              </button>
              <button
                type="button"
                onClick={saveCarousel}
                disabled={saving}
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer le carrousel'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

