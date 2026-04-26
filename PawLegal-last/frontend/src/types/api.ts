// Types pour les réponses API

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: 'client' | 'admin' | 'superadmin';
  profilComplete: boolean;
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  sexe?: 'M' | 'F' | 'Autre';
  numeroEtranger?: string;
  numeroTitre?: string;
  typeTitre?: string;
  dateDelivrance?: string;
  dateExpiration?: string;
  adressePostale?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}



