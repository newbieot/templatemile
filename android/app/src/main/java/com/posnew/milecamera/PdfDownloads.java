package com.posnew.milecamera;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

final class PdfDownloads {
    static Uri viewUri(Context context,File pdf) { return FileProvider.getUriForFile(context,context.getPackageName()+".pdf-files",pdf); }
    static Uri save(Context context,File pdf,String name) throws Exception {
        if(!name.matches("[A-Za-z0-9-]+\\.pdf")) throw new Exception("Nama PDF tidak valid.");
        if(Build.VERSION.SDK_INT>=29) {
            ContentValues values=new ContentValues(); values.put(MediaStore.MediaColumns.DISPLAY_NAME,name);
            values.put(MediaStore.MediaColumns.MIME_TYPE,"application/pdf");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/MileCamera");
            values.put(MediaStore.MediaColumns.IS_PENDING,1);
            Uri uri=context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
            if(uri==null) throw new Exception("Folder Download belum dapat dibuka. PDF tetap tersimpan di riwayat.");
            try {
                try(OutputStream output=context.getContentResolver().openOutputStream(uri)) { copy(pdf,output); }
                values.clear(); values.put(MediaStore.MediaColumns.IS_PENDING,0);
                if(context.getContentResolver().update(uri,values,null,null)<1) throw new Exception("PDF belum dapat ditampilkan di Download.");
                return uri;
            } catch(Exception error) { context.getContentResolver().delete(uri,null,null); throw error; }
        }
        if(!Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState())) throw new Exception("Penyimpanan Download belum tersedia. PDF tetap tersimpan di riwayat.");
        File folder=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),"MileCamera");
        if(!folder.isDirectory() && !folder.mkdirs()) throw new Exception("Folder Download belum dapat dibuat.");
        File target=new File(folder,name); int index=1;
        while(target.exists()) target=new File(folder,name.substring(0,name.length()-4)+"-"+(index++)+".pdf");
        File temporary=new File(folder,target.getName()+".part");
        try {
            try(OutputStream output=new FileOutputStream(temporary)) { copy(pdf,output); }
            if(!temporary.renameTo(target)) throw new Exception("PDF belum dapat dipindahkan ke Download.");
        } finally { if(temporary.exists()) temporary.delete(); }
        return Uri.fromFile(target);
    }
    private static void copy(File pdf,OutputStream output) throws Exception {
        if(output==null) throw new Exception("PDF belum dapat ditulis.");
        try(FileInputStream input=new FileInputStream(pdf)) {
            byte[] buffer=new byte[16384]; int read; while((read=input.read(buffer))!=-1) output.write(buffer,0,read);
        }
    }
}
