package com.posnew.milecamera;

import android.test.InstrumentationTestCase;

public final class AndroidSessionTest extends InstrumentationTestCase {
    private android.content.Context context;
    private static final String TOKEN="android1."+"ab".repeat(32);
    @Override protected void setUp() throws Exception { super.setUp(); context=getInstrumentation().getTargetContext(); new AndroidSession(context).clear(); }
    @Override protected void tearDown() throws Exception { new AndroidSession(context).clear(); super.tearDown(); }
    public void testFreshInstallRequiresLogin() { assertFalse(new AndroidSession(context).available()); }
    public void testVerifiedSessionSurvivesRestartEncrypted() throws Exception {
        new AndroidSession(context).storeVerified("__Host-mile_session="+TOKEN+"; Path=/; HttpOnly", "qa@example.com");
        AndroidSession restored=new AndroidSession(context); assertTrue(restored.available()); assertEquals("__Host-mile_session="+TOKEN,restored.cookie());
        String disk=context.getSharedPreferences("android-session",0).getString("credential",""); assertFalse(disk.contains(TOKEN)); assertTrue(disk.contains("iv"));
        restored.clear(); assertFalse(new AndroidSession(context).available());
    }
    public void testInvalidCredentialCannotUnlock() throws Exception {
        AndroidSession session=new AndroidSession(context);
        try { session.storeVerified("__Host-mile_session=unverified","qa@example.com"); fail("Expected rejection"); } catch(Exception expected) {}
        assertFalse(session.available()); assertFalse(new AndroidSession(context).available());
    }
    public void testTamperedCiphertextDoesNotUnlock() throws Exception {
        context.getSharedPreferences("android-session",0).edit().putString("credential","{\"iv\":\"broken\",\"data\":\"broken\"}").commit();
        assertFalse(new AndroidSession(context).available());
    }
}
