'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string; // Format ISO: YYYY-MM-DD
  onChange: (value: string) => void; // Retourne le format ISO: YYYY-MM-DD
  displayFormat?: 'dd/mm/yyyy' | 'dd-mm-yyyy';
}

/**
 * Composant DateInput qui garantit l'affichage au format jour/mois/année
 * La valeur interne reste en format ISO (YYYY-MM-DD) pour compatibilité
 */
export function DateInput({ 
  value, 
  onChange, 
  displayFormat = 'dd/mm/yyyy',
  className = '',
  ...props 
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState<string>('');
  const dateInputIdRef = useRef<string>(`date-input-${Math.random().toString(36).substr(2, 9)}`);

  // Convertir ISO (YYYY-MM-DD) vers format affiché (DD/MM/YYYY)
  const isoToDisplay = (isoDate: string): string => {
    if (!isoDate) return '';
    const date = new Date(isoDate + 'T00:00:00'); // Éviter les problèmes de timezone
    if (isNaN(date.getTime())) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return displayFormat === 'dd/mm/yyyy' 
      ? `${day}/${month}/${year}`
      : `${day}-${month}-${year}`;
  };

  // Convertir format affiché (DD / MM / YYYY) vers ISO (YYYY-MM-DD)
  const displayToIso = (displayDate: string): string | null => {
    if (!displayDate) return '';
    
    // Nettoyer la chaîne (supprimer les espaces, etc.)
    const cleaned = displayDate.replace(/\s/g, '');
    
    // Accepter les formats DD/MM/YYYY ou DD-MM-YYYY ou DD / MM / YYYY
    const parts = cleaned.split(/[\/\-]/);
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return null;
    
    // Créer la date et vérifier qu'elle est valide
    const date = new Date(year, month - 1, day);
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return null;
    }
    
    // Retourner au format ISO
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Mettre à jour la valeur affichée quand la valeur ISO change
  useEffect(() => {
    setDisplayValue(isoToDisplay(value));
  }, [value, displayFormat]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Supprimer tous les caractères non numériques sauf les slashes déjà présents
    inputValue = inputValue.replace(/[^\d\/]/g, '');
    
    // Supprimer les slashes pour reformater
    const digitsOnly = inputValue.replace(/\//g, '');
    
    // Insérer automatiquement les slashes (JJ/MM/AAAA) au fur et à mesure de la saisie
    let formatted = '';
    for (let i = 0; i < digitsOnly.length; i++) {
      // Insérer un slash après le jour (position 2) et après le mois (position 4)
      if (i === 2 || i === 4) {
        formatted += '/';
      }
      formatted += digitsOnly[i];
    }
    
    // Limiter à 10 caractères (JJ/MM/AAAA)
    if (formatted.length > 10) {
      formatted = formatted.substring(0, 10);
    }
    
    setDisplayValue(formatted);
    
    // Si l'utilisateur a saisi une date complète (10 caractères avec slashes), convertir en ISO
    if (formatted.length === 10 && formatted.split('/').length === 3) {
      const isoDate = displayToIso(formatted);
      if (isoDate !== null) {
        onChange(isoDate);
      }
    } else if (formatted === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    // À la perte de focus, reformater si nécessaire
    if (displayValue && displayValue !== isoToDisplay(value)) {
      const isoDate = displayToIso(displayValue);
      if (isoDate) {
        const formatted = isoToDisplay(isoDate);
        setDisplayValue(formatted);
        onChange(isoDate);
      } else {
        // Si la date n'est pas valide, restaurer la valeur précédente
        setDisplayValue(isoToDisplay(value));
      }
    } else if (displayValue && displayValue.replace(/\//g, '').length < 8) {
      // Si la date n'est pas complète (moins de 8 chiffres), restaurer la valeur précédente
      setDisplayValue(isoToDisplay(value));
    }
  };

  // Référence pour l'input date natif
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Gérer le changement de l'input date natif
  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={displayFormat === 'dd/mm/yyyy' ? 'JJ/MM/AAAA' : 'JJ-MM-AAAA'}
        maxLength={10}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
      {/* Icône de calendrier avec input date superposé */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center">
        {/* Input date natif superposé sur l'icône (invisible mais cliquable) */}
        <input
          ref={dateInputRef}
          type="date"
          value={value || ''}
          onChange={handleNativeDateChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
          style={{ 
            minWidth: '24px', 
            minHeight: '24px',
            fontSize: '16px'
          }}
          disabled={props.disabled}
          aria-label="Ouvrir le calendrier"
        />
        {/* Icône de calendrier visible (en arrière-plan, non cliquable car l'input est au-dessus) */}
        <div className="relative z-10 pointer-events-none">
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

