let deferredPrompt: any = null;

export const setupInstallPrompt = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
};

export const isInstallPromptAvailable = (): boolean => {
  return deferredPrompt !== null;
};

export const showInstallPrompt = async (): Promise<boolean> => {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};

export const isPWA = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
};
