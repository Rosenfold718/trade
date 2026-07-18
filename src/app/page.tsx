'use client';

import React, { useState, useEffect } from 'react';

export default function Page() {
  const [Dashboard, setDashboard] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    import('./CryptoDashboard')
      .then(mod => setDashboard(() => mod.default))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center"><p className="text-red-500">Ошибка загрузки</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded">Обновить</button></div>
      </div>
    );
  }

  if (!Dashboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto animate-pulse">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" /></svg>
          </div>
          <div><h1 className="text-xl font-bold">IntraTrade Pro</h1><p className="text-sm text-muted-foreground mt-1">Загрузка торгового терминала...</p></div>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
