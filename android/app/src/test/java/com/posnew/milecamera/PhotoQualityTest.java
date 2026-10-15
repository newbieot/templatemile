package com.posnew.milecamera;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Random;

public class PhotoQualityTest {
    private static final int W=720,H=1280;
    private static final String[] LETTERS={"11111100001000011111100001000011111","10001110111010110001100011000110001","11111101001010011100101001010011111"};
    private static byte[] label() {
        byte[] image=new byte[W*H]; Arrays.fill(image,(byte)240);
        for(int line=0;line<18;line++) for(int letter=0;letter<28;letter++) {
            String glyph=LETTERS[letter%LETTERS.length];
            for(int y=0;y<7;y++) for(int x=0;x<5;x++) if(glyph.charAt(y*5+x)=='1')
                for(int dy=0;dy<2;dy++) for(int dx=0;dx<2;dx++) image[(170+line*42+y*2+dy)*W+100+letter*17+x*2+dx]=35;
        }
        return image;
    }
    private static byte[] blur(byte[] source,int radius,boolean vertical) {
        byte[] result=new byte[source.length];
        for(int y=0;y<H;y++) for(int x=0;x<W;x++) {
            int sum=0;
            for(int offset=-radius;offset<=radius;offset++) {
                int xx=vertical?x:Math.max(0,Math.min(W-1,x+offset)), yy=vertical?Math.max(0,Math.min(H-1,y+offset)):y;
                sum+=source[yy*W+xx]&255;
            }
            result[y*W+x]=(byte)(sum/(radius*2+1));
        }
        return result;
    }
    @Test public void readableTextPassesAndOnlySeverelyUnclearOrBlankFramesFail() {
        byte[] sharp=label();
        assertTrue("Crisp document text",PhotoQuality.assess(sharp,W,H).accepted);
        assertTrue("Slight softness is not an unreadable document",PhotoQuality.assess(blur(blur(sharp,1,false),1,true),W,H).accepted);
        assertFalse("Completely smeared text",PhotoQuality.assess(blur(blur(sharp,12,false),12,true),W,H).accepted);
        byte[] blank=new byte[W*H]; Arrays.fill(blank,(byte)240);
        assertFalse("Blank label cannot be sent to AI",PhotoQuality.assess(blank,W,H).accepted);
        assertFalse("Invalid frame",PhotoQuality.assess(new byte[1],W,H).accepted);
    }
    @Test public void normalNoiseAndUncertainSoftnessDoNotForceRetake() {
        byte[] sharp=label(), soft=blur(blur(sharp,4,false),4,true); Random random=new Random(14);
        for(int i=0;i<sharp.length;i++) { int noise=random.nextInt(13)-6; sharp[i]=(byte)Math.max(0,Math.min(255,(sharp[i]&255)+noise)); soft[i]=(byte)Math.max(0,Math.min(255,(soft[i]&255)+noise)); }
        assertTrue(PhotoQuality.assess(sharp,W,H).accepted);
        assertTrue("Uncertain noisy text must not force a retake",PhotoQuality.assess(soft,W,H).accepted);
    }
    @Test public void readableLowContrastTextPasses() {
        byte[] image=label();
        for(int i=0;i<image.length;i++) image[i]=(byte)(210+((image[i]&255)-35)*30/205);
        assertTrue("Readable light print",PhotoQuality.assess(image,W,H).accepted);
    }
    @Test public void darkReadableTextAndUnevenLightingAreNotBlur() {
        for(int contrast:new int[]{12,20,40}) {
            byte[] image=label();
            for(int i=0;i<image.length;i++) image[i]=(byte)(6+((image[i]&255)-35)*contrast/205);
            assertTrue("Dark but readable, contrast "+contrast,PhotoQuality.assess(image,W,H).accepted);
        }
        byte[] image=label();
        for(int y=0;y<H;y++) for(int x=0;x<W;x++) { int i=y*W+x; image[i]=(byte)(8+((image[i]&255)-35)*(20+50*x/W)/205); }
        assertTrue("Document with a shadow",PhotoQuality.assess(image,W,H).accepted);
    }
    @Test public void analysisTimingIsSeparateFromFrozenFrameTiming() {
        byte[] image=label(); long now=System.nanoTime();
        PhotoQuality.Assessment result=PhotoQuality.assess(image,W,H);
        assertTrue(result.accepted);
        System.out.println("QUALITY_QA 720p analysis="+((System.nanoTime()-now)/1000000)+"ms (photo worker only)");
    }
}
