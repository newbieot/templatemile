package com.posnew.milecamera;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Local durable batches are independent of the current camera draft and server retention. */
final class BatchHistory {
    private final File root;
    BatchHistory(Context context) throws Exception {
        root=new File(context.getFilesDir(),"batch-history");
        if(!root.isDirectory() && !root.mkdirs()) throw new Exception("Riwayat batch belum dapat disiapkan.");
    }
    private File folder(String id) {
        if(id==null || !id.matches("CAM-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) throw new IllegalArgumentException("Batch tidak valid.");
        return new File(root,id);
    }
    synchronized List<JSONObject> list() {
        List<JSONObject> result=new ArrayList<>(); File[] folders=root.listFiles();
        if(folders!=null) for(File directory:folders) {
            try { JSONObject batch=read(folder(directory.getName()),"session.json"); validate(batch,directory); result.add(batch); }
            catch(Exception ignored) { /* An interrupted first save has no published manifest. */ }
        }
        result.sort((a,b)->b.optString("startedAt").compareTo(a.optString("startedAt")));
        return result;
    }
    synchronized SessionStore open(String id) throws Exception {
        File directory=folder(id); JSONObject batch=read(directory,"session.json"); validate(batch,directory);
        JSONArray photos=batch.getJSONArray("photos");
        for(int i=0;i<photos.length();i++) if(!photo(directory,photos.getJSONObject(i)).isFile())
            throw new Exception("Foto "+(i+1)+" batch ini belum dapat dibaca. Foto lain tetap tersimpan.");
        return new SessionStore(directory);
    }
    synchronized File save(SessionStore store) throws Exception {
        JSONObject batch=store.snapshot(); JSONArray photos=batch.getJSONArray("photos");
        if(photos.length()==0) throw new Exception("Belum ada foto untuk disimpan.");
        File directory=folder(batch.getString("id")); validate(batch,directory);
        if(!directory.isDirectory() && !directory.mkdirs()) throw new Exception("Riwayat batch belum dapat disimpan.");
        String signature=fingerprint(batch); String pdfName="batch-"+signature+".pdf"; File pdf=new File(directory,pdfName);
        List<PhotoBatchPdf.Page> pages=new ArrayList<>();
        // JPEG keys are immutable. Publish the manifest only after every image and the PDF exist.
        for(int i=0;i<photos.length();i++) {
            JSONObject item=photos.getJSONObject(i); String key=item.getString("key");
            File target=photo(directory,item); copy(store.photoFile(key),target);
            File thumbnail=store.thumbnailFile(key);
            if(thumbnail.isFile()) copy(thumbnail,new File(directory,key+"-thumb.jpg"));
            pages.add(new PhotoBatchPdf.Page(target,item.getInt("width"),item.getInt("height")));
        }
        if(!completePdf(pdf)) {
            AtomicFile atomic=new AtomicFile(pdf); FileOutputStream output=null;
            try { output=atomic.startWrite(); PhotoBatchPdf.write(output,pages); atomic.finishWrite(output); }
            catch(Exception error) { atomic.failWrite(output); throw error; }
        }
        write(directory,"session.json",batch);
        JSONObject previous=null; try { previous=read(directory,"pdf.json"); } catch(Exception ignored) { }
        JSONObject record=new JSONObject().put("fingerprint",signature).put("file",pdfName)
            .put("savedAt",previous!=null && signature.equals(previous.optString("fingerprint"))?previous.optString("savedAt"):Instant.now().toString());
        write(directory,"pdf.json",record);
        return pdf;
    }
    synchronized File pdf(String id) throws Exception {
        File directory=folder(id); JSONObject batch=read(directory,"session.json"); validate(batch,directory);
        String signature=fingerprint(batch);
        try {
            JSONObject record=read(directory,"pdf.json");
            if(signature.equals(record.optString("fingerprint")) && ("batch-"+signature+".pdf").equals(record.optString("file"))) {
                File pdf=new File(directory,record.getString("file"));
                if(completePdf(pdf)) return pdf;
            }
        } catch(Exception ignored) { }
        return save(open(id));
    }
    synchronized void startNewBatch(SessionStore active) throws Exception {
        if(active.count()>0) save(active);
        active.reset();
    }
    static String displayDate(String value) {
        try { return DateTimeFormatter.ofPattern("dd MMM yyyy · HH.mm",new Locale("id","ID")).withZone(ZoneId.systemDefault()).format(Instant.parse(value)); }
        catch(Exception ignored) { return "Tanggal belum tersedia"; }
    }
    static String downloadName(JSONObject batch) {
        String date;
        try { date=DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault()).format(Instant.parse(batch.getString("startedAt"))); }
        catch(Exception ignored) { date="batch"; }
        return "Mile-Camera-"+date+"-"+batch.optString("id").replace("CAM-","").substring(0,8)+".pdf";
    }
    private static String fingerprint(JSONObject batch) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256"); JSONArray photos=batch.getJSONArray("photos");
        for(int i=0;i<photos.length();i++) {
            JSONObject photo=photos.getJSONObject(i);
            digest.update((photo.getString("key")+":"+photo.getInt("width")+":"+photo.getInt("height")+":"+photo.getLong("bytes")+"\n").getBytes(StandardCharsets.UTF_8));
        }
        StringBuilder hex=new StringBuilder(); for(byte b:digest.digest()) hex.append(String.format(Locale.ROOT,"%02x",b&255)); return hex.toString();
    }
    private static void validate(JSONObject batch,File directory) throws Exception {
        JSONArray photos=batch.getJSONArray("photos");
        if(!directory.getName().equals(batch.getString("id")) || photos.length()==0 || photos.length()>SessionStore.MAX_PHOTOS) throw new Exception("Data batch tidak valid.");
        for(int i=0;i<photos.length();i++) photo(directory,photos.getJSONObject(i));
    }
    private static File photo(File directory,JSONObject item) throws Exception {
        String key=item.getString("key"); if(!key.matches("[a-f0-9-]{36}")) throw new Exception("Data foto tidak valid.");
        return new File(directory,key+".jpg");
    }
    private static JSONObject read(File directory,String name) throws Exception {
        return new JSONObject(new String(new AtomicFile(new File(directory,name)).readFully(),StandardCharsets.UTF_8));
    }
    private static void write(File directory,String name,JSONObject value) throws Exception {
        AtomicFile atomic=new AtomicFile(new File(directory,name)); FileOutputStream output=null;
        try { output=atomic.startWrite(); output.write(value.toString().getBytes(StandardCharsets.UTF_8)); atomic.finishWrite(output); }
        catch(Exception error) { atomic.failWrite(output); throw error; }
    }
    private static void copy(File source,File target) throws Exception {
        if(!source.isFile()) throw new Exception("Foto batch belum dapat dibaca. Batch asli tetap disimpan.");
        if(source.getCanonicalFile().equals(target.getCanonicalFile())) return;
        if(target.isFile() && target.length()==source.length()) return;
        AtomicFile atomic=new AtomicFile(target); FileOutputStream output=null;
        try(FileInputStream input=new FileInputStream(source)) {
            output=atomic.startWrite(); byte[] buffer=new byte[16384]; int read;
            while((read=input.read(buffer))!=-1) output.write(buffer,0,read);
            atomic.finishWrite(output);
        } catch(Exception error) { atomic.failWrite(output); throw error; }
    }
    private static boolean completePdf(File pdf) {
        try(FileInputStream input=new AtomicFile(pdf).openRead()) {
            long length=input.getChannel().size(); if(length<32 || input.read()!='%') return false;
            input.getChannel().position(length-6); byte[] tail=new byte[6]; int offset=0,read;
            while(offset<tail.length && (read=input.read(tail,offset,tail.length-offset))>0) offset+=read;
            return offset==6 && "%%EOF\n".equals(new String(tail,StandardCharsets.ISO_8859_1));
        } catch(Exception ignored) { return false; }
    }
}
