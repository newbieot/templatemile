package com.posnew.milecamera;

import android.test.ActivityInstrumentationTestCase2;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import java.lang.reflect.Method;

public final class LoginGateTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public LoginGateTest() { super(MainActivity.class); }
    @Override protected void setUp() throws Exception { super.setUp(); new AndroidSession(getInstrumentation().getTargetContext()).clear(); }
    public void testNoNativeEntryBypassesLogin() throws Exception {
        MainActivity activity=getActivity();
        for(int attempt=0;attempt<100 && inputCount(activity.getWindow().getDecorView())<2;attempt++) Thread.sleep(100);
        assertEquals(2,inputCount(activity.getWindow().getDecorView()));
        for(String entry:new String[]{"showHome","showCamera","openCamera","beginTransfer"}) {
            Method method=MainActivity.class.getDeclaredMethod(entry); method.setAccessible(true);
            getInstrumentation().runOnMainSync(() -> { try { method.invoke(activity); } catch(Exception error) { throw new RuntimeException(error); } });
            getInstrumentation().waitForIdleSync(); assertEquals(entry+" must require login",2,inputCount(activity.getWindow().getDecorView()));
        }
    }
    private static int inputCount(View view) {
        int count=view instanceof EditText?1:0;
        if(view instanceof ViewGroup) for(int i=0;i<((ViewGroup)view).getChildCount();i++) count+=inputCount(((ViewGroup)view).getChildAt(i));
        return count;
    }
}
