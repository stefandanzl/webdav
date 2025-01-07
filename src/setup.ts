import Cloudr from "./main";
import { CloudrSettingsTab } from "./settings";
import { Compare } from "./compare";
import { Checksum } from "./checksum";
import { Operations } from "./operations";
import { Platform } from "obsidian";

 export async function launcher(plugin: Cloudr) {
        await plugin.loadSettings();

        // plugin adds a settings tab so the user can configure various aspects of the plugin
        plugin.addSettingTab(new CloudrSettingsTab(plugin.app, plugin));

        plugin.compare = new Compare(plugin);
        plugin.checksum = new Checksum(plugin);
        plugin.operations = new Operations(plugin);

        plugin.mobile = Platform.isMobileApp;

        plugin.connectionError = false;

        plugin.skipLaunchSync = false;
        plugin.testVal = false;

        if (plugin.settings.launchSync) {
            document.addEventListener("keydown", plugin.checkKeylaunchSync, {
                once: true,
            });
        }


        plugin.settings.exclusionsOverride = false;

        plugin.setBaseWebdav();

        plugin.prevPath = `${plugin.app.vault.configDir}/plugins/webdav/prevdata.json`;
        // console.log(plugin.prevPath)

        if (plugin.settings.enableRibbons) {
            plugin.addRibbonIcon("upload-cloud", "PUSH to Webdav", () => {
                plugin.push();
            });

            plugin.addRibbonIcon("download-cloud", "PULL from Webdav", () => {
                plugin.pull();
            });
        }

        plugin.addRibbonIcon("arrow-down-up", "SYNC with Webdav", () => {
            plugin.fullSync();
        });

        plugin.addRibbonIcon("settings-2", "Open WebDav Control Panel", () => {
            plugin.displayModal();
        });

        try {
            plugin.prevData = JSON.parse(await plugin.app.vault.adapter.read(plugin.prevPath));
            // prevData.date = new Date(prevData.date)
            // plugin.prevData = prevData

            console.log("PREVDATA LOADED: ", plugin.prevData);
        } catch {
            plugin.prevData = {
                error: true,
                files: {},
            };

            plugin.app.vault.adapter.write(plugin.prevPath, JSON.stringify(plugin.prevData, null, 2));
            console.error("ERROR LOADING PREVIOUS DATA! RESET prev.json to {error: true, files: {}} ");
        }

        // plugin adds a status bar item to the bottom of the app. Does not work on mobile apps.

        plugin.statusBar = plugin.addStatusBarItem();

        plugin.statusBar2 = plugin.addStatusBarItem();
        plugin.statusBar2.setText("");

        plugin.loadingTotal = -1;

        // Optional: Apply additional styling if needed
        plugin.statusBar.style.display = "flex"; // Make the status bar a flex container

        plugin.statusBar.style.width = "25px";
        plugin.statusBar.style.color = "green";

        plugin.statusBar.classList.add("status-bar-item");
        plugin.statusBar.classList.add("mod-clickable");

        // plugin.statusBar.setText('OFF');
        plugin.statusBar.addEventListener("click", () => {
            if (plugin.app.lastEvent && plugin.app.lastEvent.ctrlKey) {
                console.log("TTTTTTTTTTTTTTTTT");
            } else {
                plugin.displayModal();
            }
        });

        plugin.addCommand({
            id: "display-modal",
            name: "Display modal",
            callback: async () => {
                plugin.displayModal();
            },
        });

        plugin.addCommand({
            id: "push",
            name: "Force PUSH all File changes",
            callback: async () => {
                plugin.push();
            },
        });

        plugin.addCommand({
            id: "pull",
            name: "Force PULL all File changes",
            callback: async () => {
                plugin.pull();
            },
        });

        plugin.addCommand({
            id: "webdav-fullsync",
            name: "Full Sync",
            callback: async () => {
                plugin.fullSync();
            },
        });

        plugin.addCommand({
            id: "save-prev",
            name: "Save State",
            callback: async () => {
                plugin.saveState();
            },
        });

        plugin.addCommand({
            id: "reset-error",
            name: "Reset Error state",
            callback: async () => {
                // plugin.prevData.error= false
                plugin.setError(false);
            },
        });

        plugin.addCommand({
            id: "delete-local",
            name: "Delete pending local files",
            callback: () => {
                plugin.operations.deleteFilesLocal(plugin.fileTrees.webdavFiles.deleted);
            },
        });

        plugin.addCommand({
            id: "delete-webdav",
            name: "Delete pending webdav files",
            callback: () => {
                plugin.operations.deleteFilesWebdav(plugin.webdavClient, plugin.baseWebdav, plugin.fileTrees.localFiles.deleted);
            },
        });

        plugin.addCommand({
            id: "toggle-pause-all",
            name: "Toggle Pause for all activities",
            callback: () => {
                plugin.togglePause();
            },
        });

        plugin.setStatus("");
        plugin.setClient();

        if (plugin.settings.liveSync) {
            plugin.setLiveSync();
        }

        if (plugin.settings.autoSync) {
            plugin.setAutoSync();
        }

        if (plugin.settings.openPull) {
            plugin.setOpenPull();
        }

        if (plugin.settings.launchSync) {
            plugin.app.workspace.onLayoutReady(() => {
                plugin.testVal = true;
                plugin.launchSyncCallback();
            });
        }
    }