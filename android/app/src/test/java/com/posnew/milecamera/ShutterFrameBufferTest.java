package com.posnew.milecamera;

import org.junit.Test;
import java.nio.ByteBuffer;
import static org.junit.Assert.*;

public final class ShutterFrameBufferTest {
    private static void publish(ShutterFrameBuffer frames, int shade, long timestamp, long arrival) {
        byte[] y=new byte[16],uv=new byte[4];
        java.util.Arrays.fill(y,(byte)shade); java.util.Arrays.fill(uv,(byte)128);
        frames.publish(ByteBuffer.wrap(y),4,1,ByteBuffer.wrap(uv),2,1,ByteBuffer.wrap(uv),2,1,
            0,0,4,4,90,true,timestamp,arrival);
    }

    @Test public void shutterKeepsOriginalLabelWhileLaterFramesReuseBothBuffers() {
        ShutterFrameBuffer frames=new ShutterFrameBuffer();
        publish(frames,60,1,1000);
        ShutterFrameBuffer.Snapshot atPress=frames.freeze(1001);
        for(int i=2;i<20;i++) publish(frames,180+i,i,1000+i);
        for(int i=0;i<16;i++) assertEquals(60,atPress.nv21[i]&255);
        assertEquals(90,atPress.rotation); assertTrue(atPress.mirror); assertEquals(1,atPress.sensorNs);
        assertEquals(1,atPress.ageNs); assertNotEquals(atPress.nv21[0],frames.freeze(1020).nv21[0]);
    }

    @Test public void missingStaleOrAlreadyCapturedFrameNeverQueuesAFutureImage() {
        ShutterFrameBuffer frames=new ShutterFrameBuffer();
        assertNull(frames.freeze(0));
        publish(frames,60,1,1000);
        assertNull(frames.freeze(999));
        assertNull(frames.freeze(1001+ShutterFrameBuffer.MAX_AGE_NS));
        assertNotNull(frames.freeze(1001)); assertNull(frames.freeze(1002));
        publish(frames,80,2,2000); assertNotNull(frames.freeze(2001));
        frames.clear(); assertNull(frames.freeze(2002));
    }

    @Test public void paddedPlanesWithOffsetsAndInterleavedChromaRespectCrop() {
        ByteBuffer y=ByteBuffer.allocate(2+6*4); y.position(2);
        for(int row=0;row<4;row++) for(int col=0;col<4;col++) y.put(2+row*6+col,(byte)(row*10+col));
        ByteBuffer u=ByteBuffer.allocate(1+8),v=ByteBuffer.allocate(2+8);u.position(1);v.position(2);
        for(int row=0;row<2;row++) for(int col=0;col<2;col++) {
            u.put(1+row*4+col*2,(byte)(70+row*10+col));
            v.put(2+row*4+col*2,(byte)(90+row*10+col));
        }
        ShutterFrameBuffer frames=new ShutterFrameBuffer();
        frames.publish(y,6,1,u,4,2,v,4,2,2,2,2,2,270,false,8,1000);
        assertArrayEquals(new byte[]{22,23,32,33,101,81},frames.freeze(1001).nv21);
        assertEquals(2,y.position());assertEquals(1,u.position());assertEquals(2,v.position());
    }

    @Test public void concurrentPublishingAndShutterCannotMixTwoLabels() throws Exception {
        ShutterFrameBuffer frames=new ShutterFrameBuffer();
        publish(frames,0,0,0);
        assertNotNull(frames.freeze(1));
        Thread writer=new Thread(() -> {for(int i=1;i<500;i++)publish(frames,i%200,i,0);});
        writer.start();int captures=0;
        while(writer.isAlive()) {
            ShutterFrameBuffer.Snapshot photo=frames.freeze(1);
            if(photo!=null) {captures++;for(int i=1;i<16;i++)assertEquals(photo.nv21[0],photo.nv21[i]);}
        }
        writer.join();publish(frames,80,500,0);
        assertNotNull(frames.freeze(1));
    }
}
