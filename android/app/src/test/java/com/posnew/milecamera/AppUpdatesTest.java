package com.posnew.milecamera;
import org.junit.Test;
import static org.junit.Assert.*;

public class AppUpdatesTest {
    @Test public void versionCodesCompareWithoutFalseUpdateForCurrentOrOlderRelease() {
        assertTrue(AppUpdates.newer(8,9)); assertFalse(AppUpdates.newer(8,8)); assertFalse(AppUpdates.newer(8,7));
        assertFalse(AppUpdates.newer(0,9)); assertFalse(AppUpdates.newer(8,-1));
    }
    @Test public void onlyOfficialVersionedHttpsApkCanBeOpened() {
        assertTrue(AppUpdates.trustedDownload("https://mile.posnew.com/downloads/Mile-Camera-0.1.8.apk"));
        for(String value:new String[]{"http://mile.posnew.com/downloads/Mile-Camera-0.1.8.apk","https://evil.test/downloads/Mile-Camera-0.1.8.apk","https://mile.posnew.com@evil.test/downloads/Mile-Camera-0.1.8.apk","https://mile.posnew.com/downloads/other.apk","https://mile.posnew.com/downloads/Mile-Camera-0.1.8.apk?next=evil","file:///data/app.apk"})
            assertFalse(value,AppUpdates.trustedDownload(value));
    }
}
