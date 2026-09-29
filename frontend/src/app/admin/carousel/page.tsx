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

type GalleryItem = {
  filename: string;
  url: string;
  type: 'image' | 'video';
  size: number;
  createdAt: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function AdminCarouselPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [cmsEntry, setCmsEntry] = useState<CmsEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [uploadingToGallery, setUploadingToGallery] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(true);

  const fileInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);

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
    loadGallery();
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
                const type: SlideType = item.type === 'video' ? 'video' : 'image';
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
          // JSON invalide : on tombera sur le fallback
        }
      }

      setSlides([{ id: 'slide-1', type: 'image', src: '', alt: '' }]);
    } catch (e: any) {
      console.error('Erreur chargement carrousel CMS:', e);
      setError(e?.response?.data?.message || 'Erreur lors du chargement du carrousel');
    } finally {
      setLoading(false);
    }
  };

  const loadGallery = async () => {
    try {
      setLoadingGallery(true);
      const res = await mediaAPI.listHeroMedia();
      setGalleryItems(res.data?.media || []);
    } catch {
      setGalleryItems([]);
    } finally {
      setLoadingGallery(false);
    }
  };

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingToGallery(true);
      setError(null);
      const res = await mediaAPI.uploadHeroMedia(file);
      if (!res.data?.success || !res.data.url) {
        setError(res.data?.message || "Erreur lors de l'ajout a la galerie.");
        return;
      }
      const newItem: GalleryItem = {
        filename: res.data.filename,
        url: res.data.url,
        type: res.data.type === 'video' ? 'video' : 'image',
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      setGalleryItems((prev) => [newItem, ...prev]);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erreur lors du televersement du media.");
    } finally {
      setUploadingToGallery(false);
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    }
  };

  const handleUseMedia = (item: GalleryItem) => {
    const label = item.filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '');
    setSlides((prev) => [
      ...prev,
      { id: `slide-${Date.now()}`, type: item.type, src: item.url, alt: label },
    ]);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDeleteMedia = async (filename: string) => {
    try {
      await mediaAPI.deleteHeroMedia(filename);
      setGalleryItems((prev) => prev.filter((i) => i.filename !== filename));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de la suppression du media');
    }
  };

  const handleSlideChange = (index: number, field: keyof HeroSlide, value: string) => {
    setSlides((prev) =>
      prev.map((slide, i) =>
        i === index
          ? { ...slide, [field]: field === 'type' ? (value as SlideType) : value }
          : slide
      )
    );
  };

  const addSlide = () => {
    setSlides((prev) => [
      ...prev,
      { id: `slide-${Date.now()}`, type: 'image', src: '', alt: '' },
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
    fileInputsRef.current[index]?.click();
  };

  const handleFileChange = async (index: number, file: File | null) => {
    if (!file) return;
    try {
      setUploadingIndex(index);
      setError(null);
      const res = await mediaAPI.uploadHeroMedia(file);
      if (!res.data?.success || !res.data.url) {
        setError(res.data?.message || "Erreur lors de l'upload du media.");
        return;
      }
      const mediaType = res.data.type === 'video' ? 'video' : 'image';
      setSlides((prev) =>
        prev.map((slide, i) =>
          i === index
            ? { ...slide, type: mediaType, src: res.data.url, alt: slide.alt || file.name }
            : slide
        )
      );
      // Ajouter aussi a la galerie si pas deja present
      const newItem: GalleryItem = {
        filename: res.data.filename,
        url: res.data.url,
        type: mediaType,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      setGalleryItems((prev) =>
        prev.some((i) => i.filename === res.data.filename) ? prev : [newItem, ...prev]
      );
    } catch (e: any) {
      console.error('Erreur upload media hero:', e);
      setError(
        e?.response?.data?.message ||
          "Erreur lors du televersement du media. Verifiez le format et la taille."
      );
    } finally {
      setUploadingIndex(null);
      const input = fileInputsRef.current[index];
      if (input) input.value = '';
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
      setError('Ajoutez au moins une image ou une video avec une URL.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = JSON.stringify(cleanedSlides);

      if (cmsEntry) {
        const res = await cmsAPI.updateEntry(cmsEntry._id, {
          value: payload,
          description: 'Configuration du carrousel de la section hero (images/videos).',
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
          description: 'Configuration du carrousel de la section hero (images/videos).',
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
            Gestion du carrousel de la page d'accueil
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerez la galerie de medias, puis configurez les slides du carrousel.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Galerie de medias */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left"
            onClick={() => setGalleryExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">Galerie de medias</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {galleryItems.length} fichier{galleryItems.length !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-xs text-gray-400">{galleryExpanded ? '▲' : '▼'}</span>
          </button>

          {galleryExpanded && (
            <div className="p-4">
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => galleryFileInputRef.current?.click()}
                  disabled={uploadingToGallery}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploadingToGallery ? 'Ajout en cours...' : '+ Ajouter a la galerie'}
                </button>
                <input
                  ref={galleryFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/ogg"
                  className="hidden"
                  onChange={handleGalleryFileChange}
                />
                <p className="text-xs text-gray-400">
                  Images (JPG, PNG, WEBP, GIF) ou videos (MP4, WEBM, OGG) - max 300 Mo
                </p>
              </div>

              {loadingGallery ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  Chargement de la galerie...
                </p>
              ) : galleryItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  Aucun media dans la galerie. Ajoutez des images ou videos ci-dessus.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {galleryItems.map((item) => (
                    <div
                      key={item.filename}
                      className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                    >
                      <div className="relative h-28 w-full bg-gray-100">
                        {item.type === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.url}
                            alt={item.filename}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-800 text-gray-300">
                            <svg
                              className="h-8 w-8"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-xs">Video</span>
                          </div>
                        )}
                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                          {item.type === 'video' ? 'VIDEO' : 'IMG'}
                        </span>
                      </div>
                      <div className="p-2">
                        <p
                          className="truncate text-[11px] text-gray-500"
                          title={item.filename}
                        >
                          {item.filename}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {formatBytes(item.size)}
                        </p>
                        <div className="mt-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleUseMedia(item)}
                            className="flex-1 rounded border border-primary px-1 py-1 text-[11px] font-medium text-primary hover:bg-primary/5"
                          >
                            Utiliser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedia(item.filename)}
                            className="rounded border border-red-200 px-1.5 py-1 text-[11px] text-red-500 hover:bg-red-50"
                            title="Supprimer de la galerie"
                          >
                            X
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Slides du carrousel */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Slides du carrousel</h2>
          <p className="text-xs text-gray-400">
            Cliquez sur "Utiliser" dans la galerie pour ajouter un slide, ou ajoutez-en un manuellement.
          </p>
        </div>

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
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveSlide(index, 'up')}
                      disabled={index === 0}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(index, 'down')}
                      disabled={index === slides.length - 1}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      &darr;
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
                      URL {slide.type === 'video' ? 'de la video' : "de l'image"}
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder={
                        slide.type === 'video' ? 'https://.../video.mp4' : 'https://.../image.jpg'
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
                          ? 'Televersement...'
                          : 'Choisir un fichier sur cet ordinateur'}
                      </button>
                      <input
                        ref={(el) => { fileInputsRef.current[index] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/ogg"
                        className="hidden"
                        onChange={(e) => handleFileChange(index, e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Texte alternatif (accessibilite)
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Court texte decrivant le visuel"
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
                + Ajouter un slide vide
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
