package com.posnew.milecamera;

/** Lightweight luminance-only focus check. Always run on the photo worker, never on shutter down. */
final class PhotoQuality {
    static final String VERSION = "focus-1";
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
        // Ignore outer framing and suppress sensor noise before measuring edge
        // width. Several sharp regions are required so a single page border or
        // a sharp object at the edge cannot approve a completely soft label.
        int left=Math.max(3,width/12), top=Math.max(3,height/12);
        int right=width-left, bottom=height-top;
        byte[] smooth=new byte[width*height];
        for(int y=top-1;y<=bottom;y++) for(int x=left-1;x<=right;x++) {
            int p=y*width+x;
            int value=(luminance[p-width-1]&255)+2*(luminance[p-width]&255)+(luminance[p-width+1]&255)
                +2*(luminance[p-1]&255)+4*(luminance[p]&255)+2*(luminance[p+1]&255)
                +(luminance[p+width-1]&255)+2*(luminance[p+width]&255)+(luminance[p+width+1]&255);
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
            if(n==0 || gradient==0 || max-min<25) continue;
            // Check both axes: a horizontal shake can leave horizontal strokes
            // sharp while making the actual characters unreadable.
            double rms=Math.sqrt(lap/n), edge=Math.sqrt(gradient/n);
            double ratio=edgesX>=20 && edgesY>=20?Math.min(Math.sqrt(lapX/gradX),Math.sqrt(lapY/gradY)):0;
            best=Math.max(best,ratio);
            if(rms>=3 && edge>=3 && ratio>=.38) sharp++;
        }
        return new Assessment(sharp>=2,best,sharp);
    }
}
