package com.posnew.milecamera;

import org.json.JSONObject;
import java.net.URI;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Public release metadata; does not send the account, password, or session cookie. */
final class AppUpdates {
    static final class Release {
        final int versionCode; final String versionName, downloadUrl;
        Release(int code,String name,String url) { versionCode=code; versionName=name; downloadUrl=url; }
    }
    static boolean newer(int installed,int offered) { return installed>0 && offered>installed; }
    static boolean trustedDownload(String value) {
        try {
            URI uri=new URI(value);
            return "https".equals(uri.getScheme()) && "mile.posnew.com".equals(uri.getHost())
                && (uri.getPort()==-1 || uri.getPort()==443) && uri.getUserInfo()==null && uri.getQuery()==null
                && uri.getFragment()==null && uri.getPath().matches("/downloads/Mile-Camera-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk");
        } catch(Exception ignored) { return false; }
    }
    static Release parse(JSONObject data,int installed) {
        int code=data.optInt("versionCode",0); String name=data.optString("versionName"), url=data.optString("downloadUrl");
        if(!newer(installed,code) || !name.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || !trustedDownload(url)
            || !"com.posnew.milecamera".equals(data.optString("applicationId"))) return null;
        return new Release(code,name,url);
    }
    static Release check(int installed) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://mile.posnew.com/api/android/update").openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
        connection.setUseCaches(false); connection.setRequestProperty("Accept","application/json");
        connection.setRequestProperty("Cache-Control","no-cache");
        try {
            if(connection.getResponseCode()!=200) throw new Exception("Update belum dapat diperiksa.");
            try(InputStream input=connection.getInputStream(); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[2048]; int length;
                while((length=input.read(buffer))!=-1) {
                    if(bytes.size()+length>16384) throw new Exception("Metadata update tidak valid.");
                    bytes.write(buffer,0,length);
                }
                return parse(new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)),installed);
            }
        } finally { connection.disconnect(); }
    }
}
