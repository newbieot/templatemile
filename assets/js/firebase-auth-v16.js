import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDj6242f-Z-TOp4-VaLG6xU62xMmKA-G_o",
  authDomain: "mile-posnew-com.firebaseapp.com",
  projectId: "mile-posnew-com",
  storageBucket: "mile-posnew-com.firebasestorage.app",
  messagingSenderId: "209481536940",
  appId: "1:209481536940:web:b76bb7d227d32db40c5609",
  measurementId: "G-GEGLN5CCK7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const $ = id => document.getElementById(id);

let resolveReady;
const ready = new Promise(resolve => { resolveReady = resolve; });
let readyResolved = false;

function finishReady(user = null) {
  if (!readyResolved) {
    readyResolved = true;
    resolveReady(user);
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function setMessage(message = "", type = "error") {
  const box = $("authMessage");
  if (!box) return;
  box.hidden = !message;
  box.textContent = message;
  box.className = `auth-message${type === "success" ? " is-success" : ""}`;
}

function setBusy(busy, label = "Memeriksa akun…") {
  const button = $("authSubmit");
  if (!button) return;
  button.disabled = Boolean(busy);
  button.textContent = busy ? label : "Masuk ke aplikasi";
}

function showLogin(message = "") {
  document.body.classList.add("auth-pending");
  $("authGate")?.removeAttribute("hidden");
  $("authUser")?.setAttribute("hidden", "");
  if (message) setMessage(message);
  window.setTimeout(() => $("authPassword")?.focus(), 80);
}

function showWorkspace(user) {
  document.body.classList.remove("auth-pending");
  $("authGate")?.setAttribute("hidden", "");
  const userBox = $("authUser");
  if (userBox) userBox.hidden = false;
  if ($("authUserEmail")) $("authUserEmail").textContent = user.email || "Pengguna";
  setMessage("");
}

function friendlyError(error) {
  const code = String(error?.code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email atau password tidak sesuai.";
  if (code.includes("too-many-requests")) return "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.";
  if (code.includes("network-request-failed")) return "Koneksi ke Firebase gagal. Periksa internet lalu coba kembali.";
  if (code.includes("user-disabled")) return "Akun ini sedang dinonaktifkan.";
  if (code.includes("invalid-email")) return "Format email belum benar.";
  return error?.message || "Login gagal. Silakan coba kembali.";
}

async function getIdToken(forceRefresh = false) {
  await ready;
  const user = auth.currentUser;
  if (!user) throw new Error("Sesi login tidak tersedia. Silakan masuk kembali.");
  return user.getIdToken(forceRefresh);
}

async function verifyBackend(user) {
  const token = await user.getIdToken(true);
  const response = await fetch("/api/auth-check", {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Akun tidak diizinkan menggunakan MILE.");
  return data;
}

window.MileAuth = {
  ready,
  getIdToken,
  get currentUser() { return auth.currentUser; },
  async logout() { await signOut(auth); }
};

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("");
  const email = normalizeEmail($("authEmail")?.value);
  const password = String($("authPassword")?.value || "");
  if (!password) {
    setMessage("Masukkan password Firebase.");
    return;
  }
  try {
    setBusy(true, "Memverifikasi akun…");
    const persistence = $("authRemember")?.checked ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await verifyBackend(credential.user);
    showWorkspace(credential.user);
  } catch (error) {
    try { await signOut(auth); } catch (_) {}
    showLogin(friendlyError(error));
  } finally {
    setBusy(false);
  }
});

$("authLogout")?.addEventListener("click", async () => {
  try { await signOut(auth); } finally { showLogin("Anda telah keluar dari aplikasi."); }
});

$("authTogglePassword")?.addEventListener("click", () => {
  const input = $("authPassword");
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  $("authTogglePassword").textContent = visible ? "Lihat" : "Sembunyikan";
});

$("authResetPassword")?.addEventListener("click", async () => {
  const email = normalizeEmail($("authEmail")?.value);
  if (!email) {
    setMessage("Masukkan email pengguna yang telah didaftarkan.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("Tautan pengaturan ulang password sudah dikirim ke email tersebut.", "success");
  } catch (error) {
    setMessage(friendlyError(error));
  }
});

onAuthStateChanged(auth, async user => {
  try {
    if (!user) {
      showLogin();
      finishReady(null);
      return;
    }
    setBusy(true, "Memeriksa sesi…");
    await verifyBackend(user);
    showWorkspace(user);
    finishReady(user);
  } catch (error) {
    try { await signOut(auth); } catch (_) {}
    showLogin(error?.message || "Sesi tidak dapat diverifikasi.");
    finishReady(null);
  } finally {
    setBusy(false);
  }
});
