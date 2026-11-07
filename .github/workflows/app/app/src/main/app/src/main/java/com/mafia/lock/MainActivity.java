package com.mafia.lock;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private static final String CORRECT_PASSWORD = "1234";

    private LinearLayout welcomeScreen;
    private LinearLayout lockScreen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        welcomeScreen = findViewById(R.id.welcomeScreen);
        lockScreen    = findViewById(R.id.lockScreen);

        // --- Welcome screen: OK button shows lock screen ---
        Button btnAccept = findViewById(R.id.btnAccept);
        btnAccept.setOnClickListener(v -> {
            welcomeScreen.setVisibility(View.GONE);
            lockScreen.setVisibility(View.VISIBLE);
        });

        // --- Fake disabled buttons (no-op) ---
        findViewById(R.id.btnEmergencyCall).setOnClickListener(v -> { });
        findViewById(R.id.btnSystemSettings).setOnClickListener(v -> { });
        findViewById(R.id.btnFactoryReset).setOnClickListener(v -> { });

        // --- Unlock logic ---
        EditText etPassword = findViewById(R.id.etPassword);
        Button   btnUnlock  = findViewById(R.id.btnUnlock);

        btnUnlock.setOnClickListener(v -> {
            String entered = etPassword.getText().toString();
            if (CORRECT_PASSWORD.equals(entered)) {
                finishAffinity();
            } else {
                Toast.makeText(this, "Incorrect Password!", Toast.LENGTH_SHORT).show();
                etPassword.setText("");
            }
        });
    }

    @Override
    public void onBackPressed() {
        // Intentionally does nothing — back navigation disabled
    }
}
