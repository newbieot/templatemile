(() => {
  'use strict';

  const emailNode = document.getElementById('sessionEmail');
  const logoutButton = document.getElementById('sessionLogout');

  async function readJson(response) {
    const text = await response.text();
    try { return JSON.parse(text); }
    catch (_) { return {}; }
  }

  async function loadSession() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        cache: 'no-store'
      });
      const data = await readJson(response);
      if (!response.ok || !data?.authenticated) {
        window.location.replace('/');
        return;
      }
      if (emailNode) emailNode.textContent = data?.user?.email || 'Pengguna terverifikasi';
    } catch (_) {
      if (emailNode) emailNode.textContent = 'Pengguna terverifikasi';
    }
  }

  async function logout() {
    if (!logoutButton) return;
    logoutButton.disabled = true;
    logoutButton.textContent = 'Keluar…';
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      });
    } finally {
      window.location.replace('/');
    }
  }

  window.addEventListener('mile:session-expired', () => window.location.replace('/'));
  logoutButton?.addEventListener('click', logout);
  loadSession();
})();
