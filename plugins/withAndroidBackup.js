const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// Backup rules for Android 11 and below (fullBackupContent)
const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="database" path="." />
  <include domain="sharedpref" path="." />
  <include domain="file" path="." />
</full-backup-content>
`;

// Backup rules for Android 12+ (dataExtractionRules)
const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="database" path="." />
    <include domain="sharedpref" path="." />
    <include domain="file" path="." />
  </cloud-backup>
  <device-transfer>
    <include domain="database" path="." />
    <include domain="sharedpref" path="." />
    <include domain="file" path="." />
  </device-transfer>
</data-extraction-rules>
`;

const withAndroidBackup = (config) => {
  // Step 1: Write the XML rule files into the Android res/xml directory
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "backup_rules.xml"), BACKUP_RULES_XML);
      fs.writeFileSync(
        path.join(xmlDir, "data_extraction_rules.xml"),
        DATA_EXTRACTION_RULES_XML
      );
      return config;
    },
  ]);

  // Step 2: Add allowBackup + references to AndroidManifest.xml <application>
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$["android:allowBackup"] = "true";
    app.$["android:fullBackupContent"] = "@xml/backup_rules";
    app.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
    return config;
  });

  return config;
};

module.exports = withAndroidBackup;
