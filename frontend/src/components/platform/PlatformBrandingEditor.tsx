'use client';

import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import Image from 'next/image';
import { Loader2, Upload } from 'lucide-react';
import { platformAPI } from '@/lib/platform/platformApi';
import {
  BRANDING_COLOR_GROUPS,
  BRANDING_COLOR_PALETTE,
  findPaletteSwatch,
  normalizeHexColor,
} from '@/lib/platform/brandingThemes';
import { getNextPublicApiOrigin } from '@/lib/publicApiUrl';

export type BrandingFormSlice = {
  brandingName: string;
  primaryColor: string;
  logo: string;
  favicon: string;
};

type Props = {
  slug: string;
  value: BrandingFormSlice;
  onChange: (patch: Partial<BrandingFormSlice>) => void;
};

function resolveAssetPreviewUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const origin = getNextPublicApiOrigin().replace(/\/+$/, '');
  return `${origin}${u.startsWith('/') ? u : `/${u}`}`;
}

export function PlatformBrandingEditor({ slug, value, onChange }: Props) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'logo' | 'favicon' | null>(null);
  const [uploadError, setUploadError] = useState('');

  const hexNormalized = normalizeHexColor(value.primaryColor) || '#2A4DD0';
  const activeSwatch = findPaletteSwatch(hexNormalized);

  const handleColorPick = (hex: string) => {
    onChange({ primaryColor: normalizeHexColor(hex) || hex });
  };

  const handleHexInput = (raw: string) => {
    const n = normalizeHexColor(raw);
    onChange({ primaryColor: n || raw });
  };

  const handleUpload = async (kind: 'logo' | 'favicon', file: File) => {
    setUploadError('');
    setUploading(kind);
    try {
      const res = await platformAPI.organizations.uploadBranding(slug, kind, file);
      const url = res.data?.url;
      if (!res.data?.success || !url) {
        setUploadError(res.data?.message || 'Échec du téléversement');
        return;
      }
      if (kind === 'logo') onChange({ logo: url });
      else onChange({ favicon: url });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setUploadError(err?.response?.data?.message || err.message || 'Échec du téléversement');
    } finally {
      setUploading(null);
    }
  };

  const onFileSelected = (kind: 'logo' | 'favicon', e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void handleUpload(kind, file);
  };

  return (
    <div className="space-y-6">
      <label className="block text-sm">
        <span className="font-medium">Nom affiché (marque cabinet)</span>
        <input
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          value={value.brandingName}
          onChange={(e) => onChange({ brandingName: e.target.value })}
          placeholder="Cabinet Dupont"
        />
      </label>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Couleur principale</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Choisie ici pour le site public du cabinet (boutons, liens, accents).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-10 w-14 border rounded-md cursor-pointer p-0.5"
              value={hexNormalized}
              onChange={(e) => handleColorPick(e.target.value)}
              title="Nuancier système"
            />
            <input
              className="w-28 border rounded-md px-2 py-1.5 text-sm font-mono uppercase"
              value={value.primaryColor}
              onChange={(e) => handleHexInput(e.target.value)}
              placeholder="#2A4DD0"
              spellCheck={false}
            />
          </div>
        </div>

        <div
          className="h-12 rounded-lg border shadow-inner"
          style={{ backgroundColor: hexNormalized }}
          aria-hidden
        />

        {BRANDING_COLOR_GROUPS.map((group) => {
          const swatches = BRANDING_COLOR_PALETTE.filter((s) => s.group === group);
          if (!swatches.length) return null;
          return (
            <div key={group}>
              <p className="text-xs font-medium text-gray-600 mb-2">{group}</p>
              <div className="flex flex-wrap gap-2">
                {swatches.map((swatch) => {
                  const selected = normalizeHexColor(swatch.hex) === hexNormalized;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      title={`${swatch.label} (${swatch.hex})`}
                      onClick={() => handleColorPick(swatch.hex)}
                      className={`relative h-9 w-9 rounded-md border-2 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 ${
                        selected
                          ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-1'
                          : 'border-white shadow'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    >
                      <span className="sr-only">{swatch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeSwatch && (
          <p className="text-xs text-gray-500">
            Palette : <span className="font-medium text-gray-700">{activeSwatch.label}</span>
          </p>
        )}
      </section>

      <AssetField
        label="Logo"
        hint="PNG, JPG, WEBP, SVG — max. 5 Mo. Recommandé : fond transparent, ~400×120 px."
        url={value.logo}
        previewUrl={resolveAssetPreviewUrl(value.logo)}
        uploading={uploading === 'logo'}
        inputRef={logoInputRef}
        onUrlChange={(logo) => onChange({ logo })}
        onPickFile={() => logoInputRef.current?.click()}
        onFileChange={(e) => onFileSelected('logo', e)}
      />

      <AssetField
        label="Favicon"
        hint="ICO, PNG ou SVG carré — max. 5 Mo. Recommandé : 32×32 ou 64×64 px."
        url={value.favicon}
        previewUrl={resolveAssetPreviewUrl(value.favicon)}
        uploading={uploading === 'favicon'}
        inputRef={faviconInputRef}
        onUrlChange={(favicon) => onChange({ favicon })}
        onPickFile={() => faviconInputRef.current?.click()}
        onFileChange={(e) => onFileSelected('favicon', e)}
        smallPreview
      />

      {uploadError && (
        <p className="text-sm text-red-600" role="alert">
          {uploadError}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Le fichier est stocké dès l’upload ; cliquez sur « Enregistrer » en bas de page pour
        valider l’ensemble du branding du cabinet.
      </p>
    </div>
  );
}

type AssetFieldProps = {
  label: string;
  hint: string;
  url: string;
  previewUrl: string;
  uploading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onUrlChange: (url: string) => void;
  onPickFile: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  smallPreview?: boolean;
};

function AssetField({
  label,
  hint,
  url,
  previewUrl,
  uploading,
  inputRef,
  onUrlChange,
  onPickFile,
  onFileChange,
  smallPreview,
}: AssetFieldProps) {
  return (
    <section className="border rounded-lg p-4 space-y-3 bg-gray-50/80">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {previewUrl ? (
          <div
            className={`relative flex-shrink-0 rounded-md border bg-white p-2 flex items-center justify-center ${
              smallPreview ? 'h-14 w-14' : 'h-16 min-w-[120px] max-w-[200px]'
            }`}
          >
            <Image
              src={previewUrl}
              alt=""
              width={smallPreview ? 40 : 160}
              height={smallPreview ? 40 : 48}
              className={`object-contain ${smallPreview ? 'h-8 w-8' : 'h-10 w-auto max-w-[180px]'}`}
              unoptimized
            />
          </div>
        ) : (
          <div
            className={`flex-shrink-0 rounded-md border border-dashed bg-white text-gray-400 text-xs flex items-center justify-center ${
              smallPreview ? 'h-14 w-14' : 'h-16 w-32'
            }`}
          >
            Aperçu
          </div>
        )}

        <div className="flex-1 min-w-[200px] space-y-2">
          <button
            type="button"
            onClick={onPickFile}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Envoi…' : 'Choisir un fichier'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
            className="hidden"
            onChange={onFileChange}
          />
          <label className="block text-xs text-gray-600">
            Ou URL directe
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://… ou /uploads/…"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
