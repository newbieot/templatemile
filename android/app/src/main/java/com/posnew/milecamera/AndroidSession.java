package com.posnew.milecamera;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores only a server-verified session credential, encrypted with a device Keystore key. */
final class AndroidSession {
    static final String ORIGIN="https://mile.posnew.com";
    private static final String KEY_ALIAS="MileCamera.PersistentSession.v1";
    private final SharedPreferences preferences;
    private String token="", email="";

    AndroidSession(Context context) {
        preferences=context.getSharedPreferences("android-session",Context.MODE_PRIVATE);
        try {
            String encoded=preferences.getString("credential","");
            if(encoded.isEmpty()) return;
            JSONObject stored=new JSONObject(encoded);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(stored.getString("iv"),Base64.NO_WRAP)));
            String restored=new String(cipher.doFinal(Base64.decode(stored.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8);
            if(!validToken(restored)) throw new Exception("Invalid credential");
            token=restored; email=preferences.getString("email","");
        } catch(Exception ignored) { clear(); }
    }

    static boolean validToken(String value) { return value!=null && value.matches("android1\\.[a-f0-9]{64}"); }
    synchronized boolean available() { return validToken(token); }
    synchronized String cookie() { return available()?"__Host-mile_session="+token:""; }
    synchronized String email() { return email; }
    synchronized void clear() { token=""; email=""; preferences.edit().clear().commit(); }

    synchronized void storeVerified(String cookieHeader,String verifiedEmail) throws Exception {
        String candidate="";
        for(String pair:cookieHeader.split(";")) {
            String trimmed=pair.trim();
            if(trimmed.startsWith("__Host-mile_session=")) candidate=trimmed.substring("__Host-mile_session=".length());
        }
        if(!validToken(candidate) || verifiedEmail==null || verifiedEmail.isEmpty()) throw new Exception("Sesi login tidak valid.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        JSONObject stored=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(cipher.doFinal(candidate.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        if(!preferences.edit().putString("credential",stored.toString()).putString("email",verifiedEmail).commit()) throw new Exception("Sesi belum dapat disimpan di HP.");
        token=candidate; email=verifiedEmail;
    }

    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(store.containsAlias(KEY_ALIAS)) return (SecretKey)store.getKey(KEY_ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    static final class Reply {
        final int status; final JSONObject data; final String setCookie;
        Reply(int status,JSONObject data,String setCookie) { this.status=status; this.data=data; this.setCookie=setCookie; }
    }
    static Reply request(String path,String method,JSONObject body,String cookie) throws Exception {
        if(!path.startsWith("/api/auth/")) throw new IllegalArgumentException("Invalid authentication endpoint");
        HttpsURLConnection connection=(HttpsURLConnection)new URL(ORIGIN+path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
        connection.setUseCaches(false); connection.setRequestMethod(method);
        connection.setRequestProperty("Accept","application/json"); connection.setRequestProperty("Origin",ORIGIN);
        connection.setRequestProperty("Cache-Control","no-store");
        if(cookie!=null && !cookie.isEmpty()) connection.setRequestProperty("Cookie",cookie);
        try {
            if(body!=null) {
                byte[] encoded=body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type","application/json"); connection.setFixedLengthStreamingMode(encoded.length);
                try(java.io.OutputStream output=connection.getOutputStream()) { output.write(encoded); }
            }
            int status=connection.getResponseCode();
            InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            if(stream!=null) try(InputStream input=stream) {
                byte[] buffer=new byte[4096]; int length;
                while((length=input.read(buffer))!=-1) {
                    if(bytes.size()+length>65536) throw new Exception("Respons login tidak valid."); bytes.write(buffer,0,length);
                }
            }
            JSONObject result=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            return new Reply(status,result,connection.getHeaderField("Set-Cookie"));
        } finally { connection.disconnect(); }
    }
}
