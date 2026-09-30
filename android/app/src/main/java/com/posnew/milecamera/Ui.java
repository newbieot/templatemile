package com.posnew.milecamera;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

final class Ui {
    static final int PAPER = Color.rgb(247,249,252), INK = Color.rgb(23,37,84), MUTED = Color.rgb(102,112,133);
    static final int BLUE = Color.rgb(37,99,235), ACCENT = Color.rgb(147,197,253), DARK = Color.rgb(11,21,56), PANEL = Color.rgb(29,52,112);
    static int dp(Context context, float value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    static GradientDrawable background(int color, float radius, Context context) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(color); result.setCornerRadius(dp(context, radius)); return result;
    }
    static TextView text(Context context, String value, float size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setFontFeatureSettings("kern");
        view.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        view.setIncludeFontPadding(false);
        return view;
    }
    static TextView button(Context context, String label, int fill, int color, Runnable action) {
        TextView button = text(context, label, 16, color, true);
        button.setGravity(Gravity.CENTER); button.setMinHeight(dp(context, 54));
        button.setPadding(dp(context, 18), dp(context, 14), dp(context, 18), dp(context, 14));
        button.setBackground(background(fill, 18, context));
        button.setClickable(true); button.setFocusable(true);
        button.setOnClickListener(view -> { if (button.isEnabled()) action.run(); });
        button.setAccessibilityDelegate(new View.AccessibilityDelegate() {
            @Override public void onInitializeAccessibilityNodeInfo(View host, android.view.accessibility.AccessibilityNodeInfo info) {
                super.onInitializeAccessibilityNodeInfo(host, info); info.setClassName("android.widget.Button");
            }
        });
        return button;
    }
    static LinearLayout column(Context context) { LinearLayout result = new LinearLayout(context); result.setOrientation(LinearLayout.VERTICAL); return result; }
    static LinearLayout row(Context context) { LinearLayout result = new LinearLayout(context); result.setGravity(Gravity.CENTER_VERTICAL); return result; }
    static void gap(LinearLayout layout, int height) { View view = new View(layout.getContext()); layout.addView(view, new LinearLayout.LayoutParams(1, dp(layout.getContext(), height))); }
    static LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(-1, -2); }

    static final class Icon extends View {
        private final String kind;
        private final int tint;
        Icon(Context context, String kind, int tint) { super(context); this.kind = kind; this.tint = tint; setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            canvas.save(); canvas.scale(getWidth() / 24f, getHeight() / 24f);
            Paint pen = new Paint(Paint.ANTI_ALIAS_FLAG); pen.setColor(tint); pen.setStyle(Paint.Style.STROKE); pen.setStrokeWidth(1.7f); pen.setStrokeCap(Paint.Cap.ROUND); pen.setStrokeJoin(Paint.Join.ROUND);
            if (kind.equals("camera")) {
                canvas.drawRoundRect(2,6,22,21,3,3,pen); canvas.drawCircle(12,13,4,pen);
                canvas.drawLine(7,6,9,3,pen); canvas.drawLine(9,3,15,3,pen); canvas.drawLine(15,3,17,6,pen);
            } else if (kind.equals("focus")) {
                canvas.drawRoundRect(3,3,21,21,4,4,pen); canvas.drawCircle(12,12,4,pen);
                canvas.drawLine(12,1,12,6,pen); canvas.drawLine(12,18,12,23,pen); canvas.drawLine(1,12,6,12,pen); canvas.drawLine(18,12,23,12,pen);
            } else if (kind.equals("check")) {
                canvas.drawCircle(12,12,9,pen); canvas.drawLine(7,12,10,15,pen); canvas.drawLine(10,15,17,8,pen);
            } else {
                canvas.drawRoundRect(3,3,21,21,4,4,pen); canvas.drawLine(5,18,10,11,pen); canvas.drawLine(10,11,14,15,pen); canvas.drawLine(14,15,19,9,pen); canvas.drawCircle(8,8,1.5f,pen);
            }
            canvas.restore();
        }
    }
}
