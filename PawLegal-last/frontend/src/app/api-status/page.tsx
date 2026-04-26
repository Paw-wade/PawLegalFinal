'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function ApiStatusPage() {
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkApiStatus = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
        const url = baseURL.endsWith('/api') ? baseURL.replace('/api', '') : baseURL;
        
        const response = await fetch(`${url}/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setApiStatus(data);
      } catch (err: any) {
        console.error('Erreur lors de la vérification du statut de l\'API:', err);
        setError(err.message || 'Impossible de contacter l\'API');
      } finally {
        setIsLoading(false);
      }
    };

    checkApiStatus();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header variant="home" />
      
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4 text-foreground">
              Statut de l&apos;API
            </h1>
            <p className="text-lg text-muted-foreground">
              Vérification de l&apos;état de l&apos;API Cabinet Juridique
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Vérification en cours...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">❌</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-900 mb-2">Erreur de connexion</h3>
                  <p className="text-red-800">{error}</p>
                  <p className="text-sm text-red-700 mt-2">
                    Vérifiez que le serveur backend est démarré sur le port 3005.
                  </p>
                </div>
              </div>
            </div>
          ) : apiStatus ? (
            <div className="space-y-6">
              <div className={`border-2 rounded-xl p-6 ${
                apiStatus.success 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    apiStatus.success 
                      ? 'bg-green-500' 
                      : 'bg-red-500'
                  }`}>
                    <span className="text-3xl text-white">
                      {apiStatus.success ? '✅' : '❌'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2">
                      {apiStatus.success ? 'API en ligne' : 'API hors ligne'}
                    </h2>
                    <p className={`text-lg ${
                      apiStatus.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {apiStatus.message}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h3 className="text-xl font-bold mb-4 text-foreground">
                  Informations de l&apos;API
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-200">
                    <span className="font-semibold text-gray-700">Statut:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      apiStatus.success 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {apiStatus.success ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </div>
                  {apiStatus.version && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Version:</span>
                      <span className="text-gray-900 font-mono">{apiStatus.version}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2">
                    <span className="font-semibold text-gray-700">Message:</span>
                    <span className="text-gray-900">{apiStatus.message}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-3 text-white">
                  Réponse JSON
                </h3>
                <pre className="text-green-400 text-sm overflow-x-auto">
                  {JSON.stringify(apiStatus, null, 2)}
                </pre>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">URL de l&apos;API:</span>{' '}
                  <code className="bg-blue-100 px-2 py-1 rounded">
                    {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'}/
                  </code>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}


