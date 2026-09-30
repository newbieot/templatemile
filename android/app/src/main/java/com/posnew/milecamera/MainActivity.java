package com.posnew.milecamera;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.text.InputType;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends ComponentActivity {
    private static final String ORIGIN="https://mile.posnew.com";
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final ExecutorService authIo=Executors.newSingleThreadExecutor();
    private final String transferToken=UUID.randomUUID().toString();
    private FrameLayout root;
    private SessionStore store;
    private AndroidSession session;
    private int authGeneration;
    private boolean loginBusy;
    private final Runnable sessionCheck=() -> verifySession();
    private CameraScreen cameraScreen;
    private WebView web;
    private TextView webTitle;
    private ProgressBar webProgress;
    private String screen="home";
    private boolean pendingTransfer, transferStarted;
    private int pollCount;
    private Bitmap galleryBitmap;
    private int galleryIndex;
    private boolean cameraLayoutPending;
    private final ActivityResultLauncher<String> cameraPermission=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted -> {
        if (granted && hasSession()) showCamera();
        else if(!hasSession()) showLogin("");
        else new AlertDialog.Builder(this).setTitle("Izin kamera diperlukan")
            .setMessage("Aktifkan izin kamera untuk mengambil foto dokumen. Foto batch yang sudah ada tetap tersimpan.")
            .setPositiveButton("Buka pengaturan",(d,w) -> startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()))))
            .setNegativeButton("Nanti",null).show();
    });

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        root=new FrameLayout(this); root.setBackgroundColor(Ui.PAPER); setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets) -> {
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            androidx.core.graphics.Insets keyboard=insets.getInsets(WindowInsetsCompat.Type.ime());
            if(screen.equals("camera")) {
                view.setPadding(0,0,0,0);
                if(cameraScreen!=null) cameraScreen.setControlInsets(bars.left,bars.top,bars.right,bars.bottom);
            } else view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));
            return insets;
        });
        session=new AndroidSession(this);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if(screen.equals("login") || screen.equals("starting")) { finish(); return; }
                if(screen.equals("signout")) { toast("Tunggu logout selesai."); return; }
                if (cameraScreen!=null && cameraScreen.isBusy()) { toast("Tunggu foto selesai disimpan."); return; }
                if (screen.equals("gallery")) openCamera();
                else if (screen.equals("web") && transferStarted) toast("Tunggu foto selesai disiapkan.");
                else if (screen.equals("web") && web!=null && web.canGoBack() && !pendingTransfer) web.goBack();
                else if (!screen.equals("home")) showHome();
                else { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); }
            }
        });
        clearScreen("starting"); theme(false);
        TextView starting=Ui.text(this,"Menyiapkan MILE…",18,Ui.INK,true); starting.setGravity(Gravity.CENTER); root.addView(starting,new FrameLayout.LayoutParams(-1,-1));
        io.execute(() -> {
            try {
                SessionStore restored=new SessionStore(this);
                runOnUiThread(() -> { if(isDestroyed()) return; store=restored; if(hasSession()) { installCookie(); showHome(); verifySession(); } else showLogin(""); });
            } catch(Exception error) {
                runOnUiThread(() -> { if(!isDestroyed()) new AlertDialog.Builder(this).setTitle("Penyimpanan belum siap").setMessage(error.getMessage()).setPositiveButton("Tutup",(d,w)->finish()).setCancelable(false).show(); });
            }
        });
    }

    private boolean hasSession() { return session!=null && session.available(); }
    private void installCookie() {
        if(!hasSession()) return;
        CookieManager manager=CookieManager.getInstance(); manager.setAcceptCookie(true);
        manager.setCookie(ORIGIN,session.cookie()+"; Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax",ignored -> manager.flush());
    }
    private void lockSession(String message) {
        authGeneration++; session.clear(); pendingTransfer=false; transferStarted=false;
        if(web!=null) web.stopLoading();
        CookieManager.getInstance().setCookie(ORIGIN,"__Host-mile_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",ignored -> CookieManager.getInstance().flush());
        showLogin(message);
    }
    private void verifySession() {
        root.removeCallbacks(sessionCheck);
        if(!hasSession() || isDestroyed()) return;
        final int generation=authGeneration; final String credential=session.cookie();
        authIo.execute(() -> {
            AndroidSession.Reply response=null;
            try { response=AndroidSession.request("/api/auth/me","GET",null,credential); } catch(Exception ignored) {}
            final AndroidSession.Reply reply=response;
            runOnUiThread(() -> {
                if(isDestroyed() || generation!=authGeneration || !credential.equals(session.cookie())) return;
                if(reply!=null && (reply.status==401 || reply.status==403)) { lockSession("Sesi tidak berlaku. Silakan masuk kembali."); return; }
                // A verified, encrypted persistent session stays usable offline; 503 is not logout.
                if(hasSession()) root.postDelayed(sessionCheck,300000);
            });
        });
    }

    private void showLogin(String message) {
        clearScreen("login"); theme(false); loginBusy=false;
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout page=Ui.column(this); page.setPadding(Ui.dp(this,28),Ui.dp(this,32),Ui.dp(this,28),Ui.dp(this,24));
        page.addView(Ui.text(this,"mile  /  CAMERA",23,Ui.INK,true)); Ui.gap(page,40);
        page.addView(Ui.text(this,"Masuk untuk\nmulai capture.",32,Ui.INK,true),Ui.matchWrap()); Ui.gap(page,12);
        TextView introduction=Ui.text(this,"Gunakan akun MILE Anda. Sesi tetap tersimpan di HP sampai Anda menekan Keluar.",15,Ui.MUTED,false); introduction.setLineSpacing(Ui.dp(this,4),1); page.addView(introduction,Ui.matchWrap()); Ui.gap(page,28);
        page.addView(Ui.text(this,"Email",13,Ui.INK,true)); Ui.gap(page,8);
        EditText email=loginField("Email akun MILE",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS); page.addView(email,Ui.matchWrap()); Ui.gap(page,20);
        page.addView(Ui.text(this,"Password",13,Ui.INK,true)); Ui.gap(page,8);
        EditText password=loginField("Password",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD); page.addView(password,Ui.matchWrap()); Ui.gap(page,8);
        TextView visibility=Ui.button(this,"Tampilkan password",Color.TRANSPARENT,Ui.BLUE,() -> {
            boolean hidden=password.getTransformationMethod() instanceof android.text.method.PasswordTransformationMethod;
            password.setTransformationMethod(hidden?null:android.text.method.PasswordTransformationMethod.getInstance()); password.setSelection(password.length());
        }); visibility.setTextSize(13); page.addView(visibility,Ui.matchWrap());
        visibility.setOnClickListener(v -> {
            boolean hidden=password.getTransformationMethod() instanceof android.text.method.PasswordTransformationMethod;
            password.setTransformationMethod(hidden?null:android.text.method.PasswordTransformationMethod.getInstance()); password.setSelection(password.length());
            visibility.setText(hidden?"Sembunyikan password":"Tampilkan password");
        });
        TextView error=Ui.text(this,message,13,Color.rgb(185,28,28),false); error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); page.addView(error,Ui.matchWrap()); Ui.gap(page,14);
        TextView submit=Ui.button(this,"Masuk ke MILE  →",Ui.BLUE,Color.WHITE,() -> {}); page.addView(submit,Ui.matchWrap());
        submit.setOnClickListener(v -> {
            if(loginBusy) return;
            String address=email.getText().toString().trim().toLowerCase(java.util.Locale.ROOT), secret=password.getText().toString();
            if(address.isEmpty() || secret.isEmpty()) { error.setText("Lengkapi email dan password."); return; }
            loginBusy=true; email.setEnabled(false); password.setEnabled(false); submit.setEnabled(false); submit.setAlpha(.65f); submit.setText("Memverifikasi akun…"); error.setText("");
            final int generation=++authGeneration;
            authIo.execute(() -> {
                String failure="";
                try {
                    AndroidSession.Reply reply=AndroidSession.request("/api/auth/login","POST",new JSONObject().put("email",address).put("password",secret).put("sessionMode","android-persistent"),"");
                    if(reply.status!=200 || !reply.data.optBoolean("persistent") || reply.setCookie==null) throw new Exception(reply.data.optJSONObject("error")!=null?reply.data.getJSONObject("error").optString("message","Login gagal."):"Login gagal. Coba kembali.");
                    session.storeVerified(reply.setCookie,reply.data.getJSONObject("user").getString("email"));
                } catch(Exception exception) { failure=exception.getMessage()==null?"Periksa koneksi lalu coba lagi.":exception.getMessage(); }
                final String result=failure;
                runOnUiThread(() -> {
                    if(isDestroyed() || generation!=authGeneration) return;
                    loginBusy=false;
                    if(!result.isEmpty()) { error.setText(result); email.setEnabled(true); password.setEnabled(true); submit.setEnabled(true); submit.setAlpha(1); submit.setText("Masuk ke MILE  →"); return; }
                    password.setText(""); ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(password.getWindowToken(),0);
                    installCookie(); showHome(); verifySession();
                });
            });
        });
        Ui.gap(page,18); page.addView(Ui.button(this,"Lupa password?",Color.TRANSPARENT,Ui.BLUE,() -> {
            String address=email.getText().toString().trim();
            if(address.isEmpty()) { error.setText("Isi email untuk menerima tautan reset password."); return; }
            authIo.execute(() -> { String result; try { AndroidSession.Reply reply=AndroidSession.request("/api/auth/reset-password","POST",new JSONObject().put("email",address),""); result=reply.status==200?reply.data.optString("message","Periksa email Anda."):"Reset password gagal. Coba kembali."; } catch(Exception ignored) { result="Periksa koneksi lalu coba kembali."; } final String text=result; runOnUiThread(() -> { if(screen.equals("login")) error.setText(text); }); });
        }),Ui.matchWrap());
        Ui.gap(page,16); TextView note=Ui.text(this,"Login pertama memerlukan internet. Kamera memakai 720p dengan ukuran maksimal 120 KB per foto.",12,Ui.MUTED,false); note.setGravity(Gravity.CENTER); page.addView(note,Ui.matchWrap());
        scroll.addView(page); root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    }
    private EditText loginField(String hint,int inputType) {
        EditText field=new EditText(this); field.setSingleLine(true); field.setTextSize(16); field.setTextColor(Ui.INK); field.setHintTextColor(Ui.MUTED);
        field.setHint(hint); field.setInputType(inputType); field.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,14)); field.setMinHeight(Ui.dp(this,56));
        field.setBackground(Ui.background(Color.WHITE,16,this)); field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES); return field;
    }
    private void logout() {
        if(!hasSession()) { showLogin(""); return; }
        final String credential=session.cookie(); final int generation=++authGeneration;
        clearScreen("signout"); theme(false);
        TextView progress=Ui.text(this,"Keluar dari akun…",18,Ui.INK,true); progress.setGravity(Gravity.CENTER); root.addView(progress,new FrameLayout.LayoutParams(-1,-1));
        authIo.execute(() -> {
            boolean complete=false;
            try { complete=AndroidSession.request("/api/auth/logout","POST",null,credential).status==200; } catch(Exception ignored) {}
            final boolean success=complete;
            runOnUiThread(() -> {
                if(isDestroyed() || generation!=authGeneration) return;
                if(success) lockSession("");
                else { showHome(); toast("Logout belum berhasil. Hubungkan internet lalu tekan Keluar lagi."); }
            });
        });
    }

    private void theme(boolean dark) {
        root.setBackgroundColor(dark?Ui.DARK:Ui.PAPER);
        getWindow().setStatusBarColor(dark?Ui.DARK:Ui.PAPER); getWindow().setNavigationBarColor(dark?Ui.DARK:Ui.PAPER);
        WindowCompat.getInsetsController(getWindow(),root).setAppearanceLightStatusBars(!dark);
        WindowCompat.getInsetsController(getWindow(),root).setAppearanceLightNavigationBars(!dark);
    }
    private void clearScreen(String next) {
        if (cameraScreen!=null) { cameraScreen.close(); cameraScreen=null; }
        if (web!=null && web.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup)web.getParent()).removeView(web);
        if (galleryBitmap!=null) { galleryBitmap.recycle(); galleryBitmap=null; }
        root.removeAllViews(); screen=next;
        WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(getWindow(),root);
        if (next.equals("camera")) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            root.setPadding(0,0,0,0);
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); bars.hide(WindowInsetsCompat.Type.systemBars());
        } else { getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); bars.show(WindowInsetsCompat.Type.systemBars()); }
        ViewCompat.requestApplyInsets(root);
    }
    private void showHome() {
        if(!hasSession()) { showLogin(""); return; }
        pendingTransfer=false; transferStarted=false;
        clearScreen("home"); theme(false);
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        LinearLayout page=Ui.column(this); int pad=Ui.dp(this,24); page.setPadding(pad,Ui.dp(this,24),pad,Ui.dp(this,24));
        LinearLayout brand=Ui.row(this);
        Ui.Icon brandIcon=new Ui.Icon(this,"camera",Ui.INK); brand.addView(brandIcon,new LinearLayout.LayoutParams(Ui.dp(this,28),Ui.dp(this,28)));
        TextView wordmark=Ui.text(this,"mile",26,Ui.INK,true); wordmark.setPadding(Ui.dp(this,10),0,0,0); brand.addView(wordmark,new LinearLayout.LayoutParams(0,-2,1));
        TextView badge=Ui.text(this,"CAMERA",10,Ui.INK,true); badge.setLetterSpacing(.14f); badge.setPadding(Ui.dp(this,12),Ui.dp(this,9),Ui.dp(this,12),Ui.dp(this,9)); badge.setBackground(Ui.background(Color.rgb(219,234,254),20,this)); brand.addView(badge);
        page.addView(brand,Ui.matchWrap()); Ui.gap(page,34);
        TextView eyebrow=Ui.text(this,"SIAP UNTUK HARI YANG SIBUK",10,Ui.MUTED,true); eyebrow.setLetterSpacing(.12f); page.addView(eyebrow);
        Ui.gap(page,12); page.addView(Ui.text(this,"Foto rapi.\nKerja lebih cepat.",36,Ui.INK,true),Ui.matchWrap());
        Ui.gap(page,12); TextView introduction=Ui.text(this,"Capture label dan dokumen dengan kamera HP. Periksa hasilnya, lalu lanjutkan ke MILE.",15,Ui.MUTED,false); introduction.setLineSpacing(Ui.dp(this,4),1); page.addView(introduction,Ui.matchWrap());
        Ui.gap(page,26);
        LinearLayout hero=Ui.column(this); hero.setPadding(Ui.dp(this,22),Ui.dp(this,22),Ui.dp(this,22),Ui.dp(this,22)); hero.setBackground(Ui.background(Ui.INK,28,this));
        LinearLayout heroTop=Ui.row(this); heroTop.addView(Ui.text(this,"KAMERA MILE",10,Ui.ACCENT,true),new LinearLayout.LayoutParams(0,-2,1));
        heroTop.addView(new Ui.Icon(this,"focus",Ui.ACCENT),new LinearLayout.LayoutParams(Ui.dp(this,25),Ui.dp(this,25))); hero.addView(heroTop);
        Ui.gap(hero,23); hero.addView(Ui.text(this,"Fokus pada\nyang penting.",27,Color.WHITE,true));
        Ui.gap(hero,10); TextView promise=Ui.text(this,"Ketuk teks untuk fokus. Foto lebih tajam, tanpa kehilangan urutan.",14,Color.rgb(203,213,235),false); promise.setLineSpacing(Ui.dp(this,3),1); hero.addView(promise,Ui.matchWrap());
        Ui.gap(hero,24); hero.addView(Ui.button(this,store.count()>0?"Lanjut capture  →":"Mulai capture  →",Ui.BLUE,Color.WHITE,this::openCamera),Ui.matchWrap());
        page.addView(hero,Ui.matchWrap()); Ui.gap(page,20);

        if (store.count()>0) {
            LinearLayout draft=Ui.column(this); draft.setPadding(Ui.dp(this,18),Ui.dp(this,18),Ui.dp(this,18),Ui.dp(this,18)); draft.setBackground(Ui.background(Color.WHITE,22,this));
            draft.addView(Ui.text(this,store.count()+" foto tersimpan",19,Ui.INK,true)); Ui.gap(draft,6);
            draft.addView(Ui.text(this,store.transferred()?"Sudah dikirim ke review. Salinan foto masih ada di HP.":"Batch terakhir siap dilanjutkan atau diperiksa.",12,Ui.MUTED,false)); Ui.gap(draft,16);
            LinearLayout actions=Ui.row(this); actions.addView(Ui.button(this,"Lihat foto",Ui.PAPER,Ui.INK,()->showGallery(store.count()-1)),new LinearLayout.LayoutParams(0,-2,1));
            View space=new View(this); actions.addView(space,new LinearLayout.LayoutParams(Ui.dp(this,10),1));
            actions.addView(Ui.button(this,"Proses AI →",Ui.INK,Color.WHITE,this::beginTransfer),new LinearLayout.LayoutParams(0,-2,1)); draft.addView(actions,Ui.matchWrap()); page.addView(draft,Ui.matchWrap()); Ui.gap(page,12);
            page.addView(Ui.button(this,"Mulai batch baru",Color.TRANSPARENT,Ui.MUTED,this::newBatch),Ui.matchWrap());
        } else {
            LinearLayout steps=Ui.row(this); steps.setGravity(Gravity.CENTER); steps.addView(Ui.text(this,"01  Capture   ·   02  Periksa   ·   03  Sinkron",12,Ui.MUTED,true)); page.addView(steps,Ui.matchWrap()); Ui.gap(page,18);
        }
        Ui.gap(page,12); page.addView(Ui.button(this,"Buka hasil & akun MILE",Color.rgb(232,238,252),Ui.INK,()->showWeb(ORIGIN+"/app")),Ui.matchWrap());
        Ui.gap(page,16); page.addView(Ui.text(this,"Masuk sebagai "+session.email(),12,Ui.MUTED,false),Ui.matchWrap());
        page.addView(Ui.button(this,"Keluar dari akun",Color.TRANSPARENT,Color.rgb(185,28,28),this::logout),Ui.matchWrap());
        Ui.gap(page,12); TextView privacy=Ui.text(this,"Sesi tetap tersimpan sampai logout. Capture 720p bisa tanpa internet; proses AI memerlukan koneksi.",12,Ui.MUTED,false); privacy.setGravity(Gravity.CENTER); privacy.setLineSpacing(Ui.dp(this,3),1); page.addView(privacy,Ui.matchWrap());
        scroll.addView(page); root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    }
    private void openCamera() {
        if(!hasSession()) { showLogin(""); return; }
        if (store.transferred()) {
            new AlertDialog.Builder(this).setTitle("Batch sebelumnya sudah dikirim")
                .setMessage("Mulai batch baru agar foto berikutnya tidak mengirim ulang batch sebelumnya. Salinan foto lama di aplikasi akan dihapus.")
                .setPositiveButton("Batch baru",(d,w)->resetAndCapture()).setNegativeButton("Lihat foto",(d,w)->showGallery(store.count()-1)).show(); return;
        }
        if (ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) showCamera();
        else cameraPermission.launch(Manifest.permission.CAMERA);
    }
    private void showCamera() {
        if(!hasSession()) { showLogin(""); return; }
        clearScreen("camera"); theme(true);
        cameraScreen=new CameraScreen(this,store,io,this::showHome,()->showGallery(store.count()-1),this::beginTransfer);
        root.addView(cameraScreen,new FrameLayout.LayoutParams(-1,-1));
        ViewCompat.requestApplyInsets(root);
    }
    private void newBatch() {
        if(!hasSession()) { showLogin(""); return; }
        new AlertDialog.Builder(this).setTitle("Mulai batch baru?").setMessage("Hapus " + store.count() + " foto batch ini dari aplikasi. Hasil yang sudah tersimpan di MILE tetap tersedia.")
            .setPositiveButton("Hapus & mulai",(d,w)->resetAndCapture()).setNegativeButton("Kembali",null).show();
    }
    private void resetAndCapture() { if(!hasSession()) { showLogin(""); return; } try { store.reset(); openCamera(); } catch (Exception error) { toast(error.getMessage()); } }

    private void showGallery(int index) {
        if(!hasSession()) { showLogin(""); return; }
        if (store.count()==0) { showHome(); return; }
        clearScreen("gallery"); theme(true); galleryIndex=Math.max(0,Math.min(index,store.count()-1));
        LinearLayout page=Ui.column(this); page.setPadding(Ui.dp(this,20),Ui.dp(this,12),Ui.dp(this,20),Ui.dp(this,16));
        LinearLayout header=Ui.row(this); TextView back=Ui.button(this,"‹",Ui.PANEL,Color.WHITE,this::showHome); back.setContentDescription("Kembali ke beranda");
        header.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,48),Ui.dp(this,48)));
        TextView heading=Ui.text(this,"Periksa foto",19,Color.WHITE,true); heading.setPadding(Ui.dp(this,14),0,0,0); header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        header.addView(Ui.text(this,(galleryIndex+1)+" / "+store.count(),13,Ui.ACCENT,true)); page.addView(header,Ui.matchWrap()); Ui.gap(page,12);
        LinearLayout imagePane=page, controls=page;
        if(getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE) {
            LinearLayout body=Ui.row(this); body.setGravity(Gravity.TOP);
            imagePane=Ui.column(this); body.addView(imagePane,new LinearLayout.LayoutParams(0,-1,1));
            View spacer=new View(this); body.addView(spacer,new LinearLayout.LayoutParams(Ui.dp(this,18),1));
            controls=Ui.column(this); ScrollView controlScroll=new ScrollView(this); controlScroll.addView(controls);
            body.addView(controlScroll,new LinearLayout.LayoutParams(Ui.dp(this,260),-1));
            page.addView(body,new LinearLayout.LayoutParams(-1,0,1));
        }
        try {
            JSONObject photo=store.snapshot().getJSONArray("photos").getJSONObject(galleryIndex);
            BitmapFactory.Options options=new BitmapFactory.Options(); options.inSampleSize=2;
            galleryBitmap=BitmapFactory.decodeFile(store.photoFile(photo.getString("key")).getPath(),options);
            ImageView image=new ImageView(this); image.setScaleType(ImageView.ScaleType.FIT_CENTER); image.setImageBitmap(galleryBitmap); image.setContentDescription("Foto dokumen " + (galleryIndex+1));
            imagePane.addView(image,new LinearLayout.LayoutParams(-1,0,1)); Ui.gap(imagePane,12);
            TextView details=Ui.text(this,photo.getInt("width")+" × "+photo.getInt("height")+"  ·  "+Math.max(1,photo.getInt("bytes")/1024)+" KB  ·  JPEG",12,Ui.ACCENT,false); details.setGravity(Gravity.CENTER); controls.addView(details,Ui.matchWrap()); Ui.gap(controls,14);
        } catch (Exception error) { toast("Foto tidak dapat dibaca."); }
        LinearLayout navigation=Ui.row(this);
        TextView previous=Ui.button(this,"← Sebelum",Ui.PANEL,Color.WHITE,()->showGallery(galleryIndex-1)); previous.setTextSize(13); previous.setEnabled(galleryIndex>0); previous.setAlpha(previous.isEnabled()?1:.35f); navigation.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
        View gap=new View(this); navigation.addView(gap,new LinearLayout.LayoutParams(Ui.dp(this,10),1));
        TextView next=Ui.button(this,"Berikut →",Ui.PANEL,Color.WHITE,()->showGallery(galleryIndex+1)); next.setTextSize(13); next.setEnabled(galleryIndex<store.count()-1); next.setAlpha(next.isEnabled()?1:.35f); navigation.addView(next,new LinearLayout.LayoutParams(0,-2,1)); controls.addView(navigation,Ui.matchWrap()); Ui.gap(controls,10);
        controls.addView(Ui.button(this,"Hapus foto ini",Color.TRANSPARENT,Color.rgb(255,165,150),()->new AlertDialog.Builder(this).setTitle("Hapus foto " +(galleryIndex+1)+"?")
            .setMessage("Foto ini dihapus dari batch. Urutan foto lainnya akan dirapikan.").setPositiveButton("Hapus",(d,w)->{ try { store.remove(galleryIndex); showGallery(galleryIndex); } catch(Exception error) { toast(error.getMessage()); } }).setNegativeButton("Kembali",null).show()),Ui.matchWrap());
        controls.addView(Ui.button(this,"Lanjut capture",Ui.BLUE,Color.WHITE,this::openCamera),Ui.matchWrap()); root.addView(page,new FrameLayout.LayoutParams(-1,-1));
    }

    private static boolean trusted(Uri uri) { return uri!=null && "https".equals(uri.getScheme()) && "mile.posnew.com".equals(uri.getHost()) && (uri.getPort()==-1 || uri.getPort()==443); }
    private void ensureWeb() {
        if (web!=null) return;
        web=new WebView(this);
        WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int progress) { if(webProgress!=null) { webProgress.setProgress(progress); webProgress.setVisibility(progress<100?View.VISIBLE:View.GONE); } }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame() && ("https".equals(request.getUrl().getScheme()) || "http".equals(request.getUrl().getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl())); } catch(Exception ignored) { toast("Tautan tidak dapat dibuka."); }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if (!trusted(uri) || uri.getPath()==null || !uri.getPath().startsWith("/__mile_native__/")) return null;
                String prefix="/__mile_native__/"+transferToken+"/";
                try {
                    if (!uri.getPath().startsWith(prefix) || !"GET".equals(request.getMethod())) return missingPhoto();
                    String key=uri.getPath().substring(prefix.length()).replaceFirst("\\.jpg$","");
                    File photo=store.findPhoto(key);
                    if (photo==null || !photo.isFile()) return missingPhoto();
                    HashMap<String,String> headers=new HashMap<>(); headers.put("Cache-Control","no-store"); headers.put("Content-Length",Long.toString(photo.length())); headers.put("X-Content-Type-Options","nosniff");
                    return new WebResourceResponse("image/jpeg",null,200,"OK",headers,new FileInputStream(photo));
                } catch(Exception ignored) { return missingPhoto(); }
            }
            @Override public void onPageFinished(WebView view,String url) {
                CookieManager.getInstance().flush();
                if(trusted(Uri.parse(url)) && screen.equals("web")) verifySession();
                if (!trusted(Uri.parse(url)) || !pendingTransfer || !screen.equals("web")) return;
                String path=Uri.parse(url).getPath();
                if ("/app".equals(path) || "/app.html".equals(path)) { view.loadUrl(ORIGIN+"/camera"); return; }
                if ("/camera".equals(path)) { if(!transferStarted) injectPhotos(); }
                else if(webTitle!=null) webTitle.setText("Masuk untuk memproses foto");
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error) {
                if (request.isForMainFrame() && screen.equals("web")) {
                    transferStarted=false;
                    new AlertDialog.Builder(MainActivity.this).setTitle("Koneksi belum tersedia").setMessage("Foto tetap tersimpan di HP. Hubungkan internet lalu coba lagi.")
                        .setPositiveButton("Coba lagi",(d,w)->web.loadUrl(pendingTransfer?ORIGIN+"/camera":ORIGIN+"/app")).setNegativeButton("Beranda",(d,w)->showHome()).show();
                }
            }
        });
    }
    private static WebResourceResponse missingPhoto() { return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new ByteArrayInputStream(new byte[0])); }
    private void showWeb(String url) {
        if(!hasSession()) { showLogin(""); return; }
        clearScreen("web"); theme(false); ensureWeb();
        LinearLayout page=Ui.column(this); LinearLayout header=Ui.row(this); header.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,8));
        TextView home=Ui.button(this,"‹",Color.rgb(232,238,252),Ui.INK,()->{ if(transferStarted) toast("Tunggu foto selesai disiapkan."); else showHome(); }); home.setContentDescription("Kembali ke beranda");
        header.addView(home,new LinearLayout.LayoutParams(Ui.dp(this,48),Ui.dp(this,48)));
        webTitle=Ui.text(this,pendingTransfer?"Menyiapkan review…":"Hasil & akun MILE",16,Ui.INK,true); webTitle.setPadding(Ui.dp(this,12),0,0,0); header.addView(webTitle,new LinearLayout.LayoutParams(0,-2,1)); page.addView(header,Ui.matchWrap());
        webProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal); page.addView(webProgress,new LinearLayout.LayoutParams(-1,Ui.dp(this,3)));
        page.addView(web,new LinearLayout.LayoutParams(-1,0,1)); root.addView(page,new FrameLayout.LayoutParams(-1,-1));
        final int generation=authGeneration;
        CookieManager.getInstance().setCookie(ORIGIN,session.cookie()+"; Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax",accepted -> {
            if(!isDestroyed() && hasSession() && generation==authGeneration && screen.equals("web")) { CookieManager.getInstance().flush(); web.loadUrl(url); }
        });
    }
    private void beginTransfer() {
        if(!hasSession()) { showLogin(""); return; }
        if (store.count()==0) return;
        pendingTransfer=true; transferStarted=false; showWeb(ORIGIN+"/camera");
    }
    private void injectPhotos() {
        if (!hasSession() || !pendingTransfer || transferStarted) return;
        transferStarted=true; pollCount=0; webTitle.setText("Menyiapkan " +store.count()+" foto…");
        try {
            JSONObject manifest=store.snapshot(); JSONArray photos=manifest.getJSONArray("photos");
            for(int i=0;i<photos.length();i++) photos.getJSONObject(i).put("url",ORIGIN+"/__mile_native__/"+transferToken+"/"+photos.getJSONObject(i).getString("key")+".jpg");
            String script;
            try(java.io.InputStream input=getAssets().open("native-handoff.js"); java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()) {
                byte[] buffer=new byte[4096]; int read;
                while((read=input.read(buffer))!=-1) bytes.write(buffer,0,read);
                script=new String(bytes.toByteArray(),StandardCharsets.UTF_8);
            }
            web.evaluateJavascript(script+"("+manifest.toString()+");",value->web.postDelayed(this::pollTransfer,250));
        } catch(Exception error) { transferError(error.getMessage()); }
    }
    private void pollTransfer() {
        if(!hasSession() || !pendingTransfer || !transferStarted || !screen.equals("web") || !trusted(Uri.parse(web.getUrl()))) return;
        if(++pollCount>240) { transferError("Menyiapkan foto memerlukan waktu terlalu lama. Foto asli tetap tersimpan; coba lagi."); return; }
        web.evaluateJavascript("JSON.stringify(window.__mileNativeTransfer || {})",value -> {
            if(!pendingTransfer || !transferStarted || !screen.equals("web")) return;
            try {
                Object result=new JSONArray("["+value+"]").get(0);
                JSONObject state=result instanceof String?new JSONObject((String)result):new JSONObject();
                if ("done".equals(state.optString("state")) && store.id().equals(state.optString("id"))) {
                    store.markTransferred(); pendingTransfer=false; transferStarted=false; webTitle.setText("Periksa hasil & proses AI");
                    web.loadUrl(ORIGIN+"/review?cameraSession="+Uri.encode(store.id())); return;
                }
                if ("error".equals(state.optString("state"))) { transferError(state.optString("message","Foto belum dapat disiapkan.")); return; }
                webTitle.setText("Menyiapkan foto "+state.optInt("progress")+" / "+store.count());
                web.postDelayed(this::pollTransfer,250);
            } catch(Exception error) { transferError("Foto belum dapat disiapkan. " +error.getMessage()); }
        });
    }
    private void transferError(String message) {
        transferStarted=false;
        new AlertDialog.Builder(this).setTitle("Foto tetap tersimpan").setMessage(message)
            .setPositiveButton("Coba lagi",(d,w)->{ if(trusted(Uri.parse(web.getUrl())) && "/camera".equals(Uri.parse(web.getUrl()).getPath())) injectPhotos(); else web.loadUrl(ORIGIN+"/camera"); })
            .setNegativeButton("Beranda",(d,w)->showHome()).show();
    }
    private void toast(String message) { Toast.makeText(this,message,Toast.LENGTH_LONG).show(); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if(screen.equals("camera") && cameraScreen!=null) {
            cameraLayoutPending=true; applyCameraRotation();
        }
        else if(screen.equals("gallery")) showGallery(galleryIndex);
        else if(screen.equals("home")) showHome();
    }
    private void applyCameraRotation() {
        if(isDestroyed() || !cameraLayoutPending || !screen.equals("camera") || cameraScreen==null) return;
        // Save any in-flight capture before rebinding the rotated camera layout.
        if(cameraScreen.isBusy()) { root.postDelayed(this::applyCameraRotation,150); return; }
        cameraLayoutPending=false; showCamera();
    }
    @Override protected void onResume() { super.onResume(); if(root!=null && store!=null && hasSession()) verifySession(); }
    @Override protected void onPause() { if(root!=null) root.removeCallbacks(sessionCheck); super.onPause(); }
    @Override protected void onDestroy() {
        authGeneration++; if(root!=null) root.removeCallbacks(sessionCheck);
        if(cameraScreen!=null) cameraScreen.close(); if(web!=null) web.destroy(); io.shutdown(); authIo.shutdown(); super.onDestroy();
    }
}
