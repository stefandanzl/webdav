import { App, PluginSettingTab, Setting } from "obsidian";
import Cloudr from "./main";

export class CloudrSettingsTab extends PluginSettingTab {
    plugin: Cloudr;

    constructor(app: App, plugin: Cloudr) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Webdav URL")
            .setDesc("Enter your Server's URL")
            .addText((text) =>
                text
                    .setPlaceholder("https://yourserver.tld/webdav")
                    .setValue(this.plugin.settings.url)
                    .onChange(async (value) => {
                        this.plugin.settings.url = value;
                        this.plugin.setClient();
                        await this.plugin.saveSettings();
                        // this.plugin.setClient()
                    })
            );

        new Setting(containerEl)
            .setName("Webdav Username")
            .setDesc("Enter your Server's Username")
            .addText((text) =>
                text
                    .setPlaceholder("username")
                    .setValue(this.plugin.settings.username)
                    .onChange(async (value) => {
                        this.plugin.settings.username = value;
                        this.plugin.setClient();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Webdav Password")
            .setDesc("Enter your Server's Password")
            .addText((text) =>
                text
                    .setPlaceholder("passw0rd")
                    .setValue(this.plugin.settings.password)
                    .onChange(async (value) => {
                        this.plugin.settings.password = value;
                        this.plugin.setClient();
                        await this.plugin.saveSettings();
                        // this.plugin.setClient()
                    })
            );

        new Setting(containerEl)
            .setName("Apply and Test Server Config")
            .setDesc("Click Button to test Server's connection")
            .addButton((button) =>
                button
                    .onClick(async () => {
                        this.plugin.setClient().then(async () => {
                            button.setButtonText((await this.plugin.operations.test(true)) ? "OK" : "FAIL");
                            // if( this.plugin.message){
                            //     // nothing yet
                            // }
                        });
                    })
                    .setButtonText(this.plugin.prevData.error ? "FAIL" : "OK")
            );

        new Setting(containerEl)
            .setName("Webdav Base Directory")
            .setDesc("Enter your Server's Base Directory - your Vault will be created inside of it")
            .addText((text) =>
                text
                    .setPlaceholder("/")
                    .setValue(this.plugin.settings.webdavPath)
                    .onChange(async (value) => {
                        this.plugin.settings.webdavPath = value.replace(/\\/g, "/");
                        await this.plugin.saveSettings();
                        await this.plugin.setBaseWebdav();
                        this.plugin.operations.test();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Override remote Vault Name")
            .setDesc("Use only if the remote Vault's name differs from this")
            .addText((text) =>
                text
                    .setPlaceholder("vaultname")
                    .setValue(this.plugin.settings.overrideVault)
                    .onChange(async (value) => {
                        this.plugin.settings.overrideVault = value.replace(/\\/g, "/");
                        await this.plugin.saveSettings();
                        await this.plugin.setBaseWebdav();
                        // this.plugin.test()
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Excluded Directories")
            .setDesc("Enter single folder names in separate lines")
            .addTextArea((text) =>
                text
                    .setPlaceholder("My Files\nalbum\nDocuments")
                    .setValue(this.plugin.settings.exclusions.directories.join("\n"))
                    .onChange(async (value) => {
                        value = value.replace(/\r/g, "").replace(/\\/g, "/");
                        this.plugin.settings.exclusions.directories = value.split("\n").filter((v) => v !== "");
                        await this.plugin.saveSettings();
                        console.log("Settings saved:", this.plugin.settings.exclusions);
                    })
            );

        new Setting(containerEl)
            .setName("Excluded file extensions")
            .setDesc("Enter extensions separated with commas (,)")
            .addText((text) =>
                text
                    .setPlaceholder(".json, .exe, .zip")
                    .setValue(this.plugin.settings.exclusions.extensions.join(", "))
                    .onChange(async (value) => {
                        value = value.replace(/ /g, "");
                        this.plugin.settings.exclusions.extensions = value.split(",").filter((v) => v !== "");
                        await this.plugin.saveSettings();
                        console.log("Settings saved:", this.plugin.settings.exclusions);
                    })
            );

        new Setting(containerEl)
            .setName("Excluded filename markers")
            .setDesc("Enter markers in separate lines")
            .addTextArea((text) =>
                text
                    .setPlaceholder("_secret_\n°cache~\n_archive_\nfolder1/folder2")
                    .setValue(this.plugin.settings.exclusions.markers.join("\n"))
                    .onChange(async (value) => {
                        value = value.replace(/\r/g, "").replace(/\\/g, "/");
                        this.plugin.settings.exclusions.markers = value.split("\n").filter((v) => v !== "");
                        await this.plugin.saveSettings();
                        console.log("Settings saved:", this.plugin.settings.exclusions);
                    })
            );

        new Setting(containerEl)
            .setName("Mod Sync")
            .setDesc("Enable Synchronization on modification")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.liveSync).onChange(async (value) => {
                    this.plugin.settings.liveSync = value;
                    this.plugin.setLiveSync();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Auto Interval Sync")
            .setDesc("Enable automatic syncing in intervals\nThis will override Mod Sync")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    this.plugin.setAutoSync();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Auto Interval Sync periodic interval in seconds")
            .setDesc("Enter the desired interval in seconds")
            .addText((text) =>
                text
                    .setPlaceholder("10")
                    .setValue(this.plugin.settings.autoSyncInterval.toString())
                    .onChange(async (value) => {
                        const parseVal = parseInt(value, 10);
                        if (isNaN(parseVal)) {
                            console.error("Failed to parse the string as a number.");
                            this.plugin.show("Invalid number entered");
                        } else {
                            // console.log("Successfully parsed:", parseVal);
                            this.plugin.settings.autoSyncInterval = parseVal;

                            this.plugin.setAutoSync();

                            await this.plugin.saveSettings();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Enable Ribbons")
            .setDesc("Enable PULL Action on Obsidian Start - Reload App for changes to take effect")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableRibbons).onChange(async (value) => {
                    this.plugin.settings.enableRibbons = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Override disable ignore")
            .setDesc(
                "Enable this setting to sync ALL files, even excluded ones - useful for initial PULL or to replicate local state on other devices with PUSH"
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.exclusionsOverride).onChange(async (value) => {
                    this.plugin.settings.exclusionsOverride = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Skip .obsidian sync on mobile")
            .setDesc("Recommended especially for mobile usage for faster file checking")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.skipHiddenMobile).onChange(async (value) => {
                    this.plugin.settings.skipHiddenDesktop = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Skip .obsidian sync on desktop")
            .setDesc("Will only apply to desktop version")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.skipHiddenDesktop).onChange(async (value) => {
                    this.plugin.settings.skipHiddenDesktop = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Webdav Daily Notes Folder")
            .setDesc("")
            .addText((text) =>
                text
                    .setPlaceholder("Daily Notes")
                    .setValue(this.plugin.settings.dailyNotesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNotesFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Webdav Daily Notes File Naming Template")
            .setDesc("Enter in moment syntax")
            .addText((text) =>
                text
                    .setPlaceholder("YYYY/YYYY-MM/YYYY-MM-DD ddd")
                    .setValue(this.plugin.settings.dailyNotesFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNotesFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Webdav Daily Notes Template File")
            .setDesc("Enter path of file you want to be used as template when creating new Daily Note.")
            .addText((text) =>
                text
                    .setPlaceholder("Templates/Daily Notes")
                    .setValue(this.plugin.settings.dailyNotesTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNotesTemplate = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Daily Note add Timestamp")
            .setDesc("Move cursor to the end of Daily Note and insert timestamp in the form of 'HH:MM - '")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.dailyNotesTimestamp).onChange(async (value) => {
                    this.plugin.settings.dailyNotesTimestamp = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
