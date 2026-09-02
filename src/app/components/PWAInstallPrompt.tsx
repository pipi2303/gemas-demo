import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import {
  isInstallPromptAvailable,
  showInstallPrompt,
  isPWA,
  setupInstallPrompt
} from '../utils/pwaUtils';

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Setup install prompt handler
    setupInstallPrompt();

    // Check if already installed
    setIsInstalled(isPWA());

    // Check if install prompt is available
    const checkPrompt = () => {
      if (isInstallPromptAvailable() && !isPWA()) {
        // Show prompt after 30 seconds
        setTimeout(() => {
          setShowPrompt(true);
        }, 30000);
      }
    };

    checkPrompt();

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
    });
  }, []);

  const handleInstall = async () => {
    const accepted = await showInstallPrompt();
    if (accepted) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for this session
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Tutup"
        >
          <X className="size-4 text-gray-500" />
        </button>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-[#f0ede5] rounded-lg">
            <Smartphone className="size-6 text-[#144f6b]" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              Install Aplikasi
            </h3>
            <p className="text-sm text-gray-600">
              Install GPIB Bahtera Kasih di perangkat Anda untuk akses yang lebih cepat dan mudah.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <CheckCircle className="size-4 text-[#1A77A3]" />
            <span>Akses offline</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <CheckCircle className="size-4 text-[#1A77A3]" />
            <span>Notifikasi real-time</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <CheckCircle className="size-4 text-[#1A77A3]" />
            <span>Performa lebih cepat</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleDismiss}
            variant="outline"
            className="flex-1"
          >
            Nanti Saja
          </Button>
          <Button
            onClick={handleInstall}
            className="flex-1 bg-[#1A77A3] hover:bg-[#144f6b] text-white"
          >
            <Download className="size-4 mr-2" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PWAStatusIndicator() {
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    setIsAppInstalled(isPWA());

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isAppInstalled) {
    return null;
  }

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 bg-[#384959] text-white text-center py-2 px-4 z-50">
          <p className="text-sm font-medium">
            Mode Offline - Beberapa fitur mungkin tidak tersedia
          </p>
        </div>
      )}
    </>
  );
}
