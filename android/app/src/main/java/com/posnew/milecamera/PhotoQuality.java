package com.posnew.milecamera;

/** Lightweight luminance-only focus check. Always run on the photo worker, never on shutter down. */
final class PhotoQuality {
    static final String VERSION = "focus-2-readable";
    static final class Assessment {
        final boolean accepted;
        final double sharpness;
        final int sharpTiles;
        Assessment(boolean accepted, double sharpness, int sharpTiles) {
            this.accepted=accepted; this.sharpness=sharpness; this.sharpTiles=sharpTiles;
        }
    }

    static Assessment assess(byte[] luminance, int width, int height) {
        if(width<80 || height<80 || luminance==null || (long)width*height>luminance.length)
            return new Assessment(false,0,0);
        // Exposure is not focus. Stretch the useful luminance range so readable
        // dark/light print is judged by edge width rather than absolute brightness.
        int left=Math.max(3,width/12), top=Math.max(3,height/12);
        int right=width-left, bottom=height-top;
        int[] histogram=new int[256]; int samples=0;
        for(int y=top;y<bottom;y++) for(int x=left;x<right;x++) { histogram[luminance[y*width+x]&255]++; samples++; }
        int tail=Math.max(1,samples/500),low=0,high=255,total=0;
        while(low<255 && (total+=histogram[low])<tail) low++;
        total=0; while(high>0 && (total+=histogram[high])<tail) high--;
        if(high-low<6) {
            // Only a practically featureless frame is certainly unreadable.
            // Sparse faint text/noisy low light remains uncertain and may pass.
            int first=0,last=255;
            while(first<255 && histogram[first]==0) first++;
            while(last>0 && histogram[last]==0) last--;
            return new Assessment(last-first>=4,0,0);
        }
        int[] normalize=new int[256];
        for(int i=0;i<256;i++) normalize[i]=Math.max(0,Math.min(255,(i-low)*255/(high-low)));
        byte[] smooth=new byte[width*height];
        for(int y=top-1;y<=bottom;y++) for(int x=left-1;x<=right;x++) {
            int p=y*width+x;
            int value=normalize[luminance[p-width-1]&255]+2*normalize[luminance[p-width]&255]+normalize[luminance[p-width+1]&255]
                +2*normalize[luminance[p-1]&255]+4*normalize[luminance[p]&255]+2*normalize[luminance[p+1]&255]
                +normalize[luminance[p+width-1]&255]+2*normalize[luminance[p+width]&255]+normalize[luminance[p+width+1]&255];
            smooth[p]=(byte)((value+8)/16);
        }
        int sharp=0; double best=0;
        for(int row=0;row<8;row++) for(int col=0;col<6;col++) {
            int x0=left+(right-left)*col/6, x1=left+(right-left)*(col+1)/6;
            int y0=top+(bottom-top)*row/8, y1=top+(bottom-top)*(row+1)/8;
            double lap=0, gradient=0, lapX=0, lapY=0, gradX=0, gradY=0; int n=0, min=255, max=0, edgesX=0, edgesY=0;
            for(int y=y0;y<y1;y++) for(int x=x0;x<x1;x++) {
                int p=y*width+x, c=smooth[p]&255;
                int l=smooth[p-1]&255, r=smooth[p+1]&255, t=smooth[p-width]&255, b=smooth[p+width]&255;
                int second=l+r+t+b-4*c, dx=r-l, dy=b-t;
                int sx=l+r-2*c, sy=t+b-2*c;
                lap+=(double)second*second; gradient+=(double)dx*dx+(double)dy*dy; n++;
                // Flat-area noise must not count as sharp edges. Measure edge
                // width only where the smoothed image has a meaningful gradient.
                if(Math.abs(dx)>=8) { lapX+=(double)sx*sx; gradX+=(double)dx*dx; edgesX++; }
                if(Math.abs(dy)>=8) { lapY+=(double)sy*sy; gradY+=(double)dy*dy; edgesY++; }
                min=Math.min(min,c); max=Math.max(max,c);
            }
            if(n==0 || gradient==0 || max-min<18) continue;
            // Check both axes: a horizontal shake can leave horizontal strokes
            // sharp while making the actual characters unreadable.
            double rms=Math.sqrt(lap/n), edge=Math.sqrt(gradient/n);
            double ratio=edgesX>=20 && edgesY>=20?Math.min(Math.sqrt(lapX/gradX),Math.sqrt(lapY/gradY)):0;
            best=Math.max(best,ratio);
            if(rms>=1 && edge>=1 && ratio>=.27) sharp++;
        }
        return new Assessment(sharp>=1,best,sharp);
    }
}
