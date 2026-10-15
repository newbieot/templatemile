package com.posnew.milecamera;

import java.io.File;
import java.io.FileInputStream;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/** Streams the original normalized JPEGs into a PDF, one complete photograph per page. */
final class PhotoBatchPdf {
    static final class Page {
        final File jpeg; final int width,height;
        Page(File jpeg,int width,int height) { this.jpeg=jpeg; this.width=width; this.height=height; }
    }
    private static final class Counter extends FilterOutputStream {
        long position;
        Counter(OutputStream output) { super(output); }
        @Override public void write(int value) throws IOException { out.write(value); position++; }
        @Override public void write(byte[] bytes,int offset,int length) throws IOException { out.write(bytes,offset,length); position+=length; }
        void text(String text) throws IOException { write(text.getBytes(StandardCharsets.ISO_8859_1)); }
    }
    static void write(OutputStream output,List<Page> pages) throws IOException {
        if(pages.isEmpty() || pages.size()>SessionStore.MAX_PHOTOS) throw new IOException("Batch PDF tidak valid.");
        Counter stream=new Counter(output); long[] offsets=new long[3+pages.size()*3];
        stream.text("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
        object(stream,offsets,1,"<< /Type /Catalog /Pages 2 0 R >>");
        StringBuilder children=new StringBuilder();
        for(int i=0;i<pages.size();i++) children.append(3+i*3).append(" 0 R ");
        object(stream,offsets,2,"<< /Type /Pages /Count "+pages.size()+" /Kids [ "+children+"] >>");
        byte[] buffer=new byte[16384];
        for(int i=0;i<pages.size();i++) {
            Page page=pages.get(i); int id=3+i*3;
            if(!page.jpeg.isFile() || page.jpeg.length()<4 || page.width<=0 || page.height<=0) throw new IOException("Foto "+(i+1)+" tidak dapat disimpan ke PDF.");
            int width=page.width>page.height?842:595, height=page.width>page.height?595:842;
            double scale=Math.min((width-36d)/page.width,(height-36d)/page.height);
            double w=page.width*scale,h=page.height*scale;
            object(stream,offsets,id,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+width+" "+height+"] /Resources << /XObject << /Photo "+(id+1)+" 0 R >> >> /Contents "+(id+2)+" 0 R >>");
            offsets[id+1]=stream.position;
            long length=page.jpeg.length();
            stream.text((id+1)+" 0 obj\n<< /Type /XObject /Subtype /Image /Width "+page.width+" /Height "+page.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+length+" >>\nstream\n");
            try(FileInputStream input=new FileInputStream(page.jpeg)) {
                if(input.read()!=255 || input.read()!=216) throw new IOException("Format foto "+(i+1)+" bukan JPEG.");
                stream.write(255); stream.write(216); long copied=2; int read;
                while((read=input.read(buffer))!=-1) { stream.write(buffer,0,read); copied+=read; }
                if(copied!=length) throw new IOException("Foto berubah saat PDF dibuat. Coba kembali.");
            }
            stream.text("\nendstream\nendobj\n");
            String drawing=String.format(Locale.ROOT,"q\n%.4f 0 0 %.4f %.4f %.4f cm\n/Photo Do\nQ\n",w,h,(width-w)/2,(height-h)/2);
            object(stream,offsets,id+2,"<< /Length "+drawing.getBytes(StandardCharsets.ISO_8859_1).length+" >>\nstream\n"+drawing+"endstream");
        }
        long xref=stream.position;
        stream.text("xref\n0 "+offsets.length+"\n0000000000 65535 f \n");
        for(int i=1;i<offsets.length;i++) stream.text(String.format(Locale.ROOT,"%010d 00000 n \n",offsets[i]));
        stream.text("trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n"); stream.flush();
    }
    private static void object(Counter stream,long[] offsets,int id,String body) throws IOException {
        offsets[id]=stream.position; stream.text(id+" 0 obj\n"+body+"\nendobj\n");
    }
}
