(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('loginForm');
  const emailInput = $('email');
  const passwordInput = $('password');
  const rememberInput = $('remember');
  const submitButton = $('submitButton');
  const messageBox = $('formMessage');
  const toggleButton = $('togglePassword');
  const resetButton = $('resetPassword');

  function setMessage(message, type = 'error') {
    messageBox.hidden = !message;
    messageBox.className = `form-message${type === 'success' ? ' is-success' : ''}`;
    messageBox.textContent = message || '';
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    emailInput.disabled = busy;
    passwordInput.disabled = busy;
    rememberInput.disabled = busy;
    submitButton.querySelector('span:first-child').textContent = busy ? 'Memverifikasi akun…' : 'Masuk ke aplikasi';
  }

  async function readJson(response) {
    const text = await response.text();
    try { return JSON.parse(text); }
    catch (_) { return { error: { message: 'Server mengembalikan respons yang tidak valid.' } }; }
  }

  async function login(event) {
    event.preventDefault();
    setMessage('');

    const email = String(emailInput.value || '').trim().toLowerCase();
    const password = String(passwordInput.value || '');
    if (!email || !password) {
      setMessage('Lengkapi email dan password terlebih dahulu.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email, password, remember: rememberInput.checked })
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error?.message || 'Login gagal.');
      setMessage('Login berhasil. Membuka workspace…', 'success');
      window.setTimeout(() => window.location.replace('/'), 250);
    } catch (error) {
      setMessage(error?.message || 'Login gagal. Periksa koneksi lalu coba kembali.');
      passwordInput.select();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const email = String(emailInput.value || '').trim().toLowerCase();
    if (!email) {
      setMessage('Isi email terlebih dahulu untuk menerima tautan reset password.');
      emailInput.focus();
      return;
    }

    resetButton.disabled = true;
    setMessage('');
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error?.message || 'Reset password gagal.');
      setMessage(data?.message || 'Jika akun terdaftar, petunjuk reset password akan dikirim.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Reset password gagal.');
    } finally {
      resetButton.disabled = false;
    }
  }

  toggleButton.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    toggleButton.textContent = showing ? 'Lihat' : 'Sembunyikan';
    toggleButton.setAttribute('aria-label', showing ? 'Tampilkan password' : 'Sembunyikan password');
    passwordInput.focus();
  });

  form.addEventListener('submit', login);
  resetButton.addEventListener('click', resetPassword);
  passwordInput.focus();
})();
