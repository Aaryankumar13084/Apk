const express = require("express");
const fs = require("fs-extra");
const shell = require("shelljs");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Storage Setup
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, "icon.png");
  },
});
const upload = multer({ storage });

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// APK Generator API
app.post("/generate-apk", upload.single("icon"), async (req, res) => {
  const { appName, websiteURL } = req.body;

  if (!appName || !websiteURL) {
    return res.status(400).send("App Name और Website URL ज़रूरी हैं!");
  }

  const outputName = appName.replace(/\s+/g, "_"); // Spaces हटाकर नाम ठीक करो
  const packageName = "com.webtoapk." + outputName.toLowerCase();
  const projectPath = path.join(__dirname, "output", outputName);

  // Output Directory बनाओ
  fs.ensureDirSync(projectPath);

  // Manifest File
  const manifestContent = `
  <manifest xmlns:android="http://schemas.android.com/apk/res/android"
      package="${packageName}">
      <uses-permission android:name="android.permission.INTERNET"/>
      <application android:allowBackup="true" android:icon="@mipmap/ic_launcher" android:label="${appName}" android:theme="@style/Theme.MaterialComponents.DayNight.NoActionBar">
          <activity android:name=".MainActivity" android:exported="true">
              <intent-filter>
                  <action android:name="android.intent.action.MAIN"/>
                  <category android:name="android.intent.category.LAUNCHER"/>
              </intent-filter>
          </activity>
      </application>
  </manifest>`;

  fs.writeFileSync(`${projectPath}/AndroidManifest.xml`, manifestContent);

  // MainActivity.java
  const mainActivityContent = `
  package ${packageName};
  import android.app.Activity;
  import android.os.Bundle;
  import android.webkit.WebView;
  import android.webkit.WebSettings;
  
  public class MainActivity extends Activity {
      @Override
      protected void onCreate(Bundle savedInstanceState) {
          super.onCreate(savedInstanceState);
          WebView webView = new WebView(this);
          WebSettings webSettings = webView.getSettings();
          webSettings.setJavaScriptEnabled(true);
          webView.loadUrl("${websiteURL}");
          setContentView(webView);
      }
  }`;

  fs.writeFileSync(`${projectPath}/MainActivity.java`, mainActivityContent);

  // APK Paths
  const unsignedAPK = path.join(projectPath, `${outputName}.apk`);
  const signedAPK = path.join(projectPath, `${outputName}-signed.apk`);

  // APK Build Command
  const buildCommand = `apktool b ${projectPath} -o ${unsignedAPK}`;
  const signCommand = `apksigner sign --ks my-release-key.jks --ks-pass pass:password ${unsignedAPK}`;

  shell.exec(buildCommand, { silent: false }, (code, stdout, stderr) => {
    if (code !== 0) {
      return res.status(500).send("APK Build Failed: " + stderr);
    }

    // APK Signing
    shell.exec(signCommand, { silent: false }, (signCode, signOut, signErr) => {
      if (signCode !== 0) {
        return res.status(500).send("APK Signing Failed: " + signErr);
      }

      res.download(signedAPK);
    });
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server Running at http://localhost:${PORT}`);
});
