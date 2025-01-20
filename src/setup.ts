import Cloudr  from "./main";
import { CloudrSettingsTab } from "./settings";
import { Compare } from "./compare";
import { Checksum } from "./checksum";
import { Operations } from "./operations";
import { Platform, setIcon } from "obsidian";
import { Status } from "./const";

export async function launcher(plugin: Cloudr) {
    await plugin.loadSettings();
    plugin.doLog = false;

    // plugin adds a settings tab so the user can configure various aspects of the plugin
    plugin.addSettingTab(new CloudrSettingsTab(plugin.app, plugin));

    plugin.compare = new Compare(plugin);
    plugin.checksum = new Checksum(plugin);
    plugin.operations = new Operations(plugin);

    plugin.mobile = Platform.isMobileApp;
    plugin.settings.exclusionsOverride = false;
    plugin.setBaseWebdav();
    plugin.prevPath = `${plugin.app.vault.configDir}/plugins/webdav/prevdata.json`;
    // console.log(plugin.prevPath)

    plugin.allFiles = {
        local: {},
        webdav: {}
    }

    if (plugin.settings.enableRibbons) {
        plugin.addRibbonIcon("upload-cloud", "PUSH to Webdav", () => {
            plugin.operations.sync({
                local: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                    except: 1,
                },
                webdav: {},
            });
        });

        plugin.addRibbonIcon("download-cloud", "PULL from Webdav", () => {
            plugin.operations.sync({
                local: {},
                webdav: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                    except: 1,
                },
            });
        });
    }

    plugin.addRibbonIcon("arrow-down-up", "SYNC with Webdav", () => {
        plugin.operations.sync({
            local: {
                added: 1,
                deleted: 1,
                modified: 1,
            },
            webdav: {
                added: 1,
                deleted: 1,
                modified: 1,
            },
        });
    });

    plugin.addRibbonIcon("settings-2", "Open WebDav Control Panel", () => {
        plugin.displayModal();
    });

    try {
        plugin.prevData = JSON.parse(await plugin.app.vault.adapter.read(plugin.prevPath));
        // prevData.date = new Date(prevData.date)
        // plugin.prevData = prevData

        plugin.log("PREVDATA LOADED: ", plugin.prevData);
    } catch (error) {
        plugin.prevData = {
            error: true,
            files: {},
            date: Date.now(),
            except: {},
        };

        plugin.app.vault.adapter.write(plugin.prevPath, JSON.stringify(plugin.prevData, null, 2));
        console.error("ERROR LOADING PREVIOUS DATA! RESET prevdata.json to {error: true, files: {}} \n", error);
        plugin.show("Failed to read previous data\nThis is to be expected if the plugin is new", 5000);
    }

    // plugin adds a status bar item to the bottom of the app. Does not work on mobile apps.

    plugin.statusBar = plugin.addStatusBarItem();

    plugin.statusBar2 = plugin.addStatusBarItem();
    plugin.statusBar2.setText("");

    plugin.loadingTotal = -1;



// In your main plugin class
plugin.statusBar = plugin.addStatusBarItem();
plugin.statusBar.addClass('plugin-sync'); // Main container class
plugin.statusBar.setAttribute('aria-label', 'Uninitialized');
plugin.statusBar.setAttribute('data-tooltip-position', 'top');

// Create inner container
const innerDiv = plugin.statusBar.createDiv('status-bar-item-segment');

// Create span for icon
plugin.iconSpan = innerDiv.createSpan({
   cls: ['status-bar-item-icon', 'sync-status-icon']
});

// Set the icon
setIcon(plugin.iconSpan, 'refresh-cw-off');

// Or if you need more control over the classes:
plugin.statusBar
   .addClass('status-bar-item', 'plugin-sync');


// Or more Obsidian-style
plugin.statusBar.onClickEvent(() => {
    // Your click handler
    plugin.displayModal();
});











    // // Optional: Apply additional styling if needed
    // plugin.statusBar.style.display = "flex"; // Make the status bar a flex container

    // plugin.statusBar.style.width = "25px";
    // plugin.statusBar.style.color = "green";

    // plugin.statusBar.classList.add("status-bar-item");
    // plugin.statusBar.classList.add("mod-clickable");

    // // plugin.statusBar.setText('OFF');
    // plugin.statusBar.addEventListener("click", () => {
    //     if (plugin.app.lastEvent && plugin.app.lastEvent.ctrlKey) {
    //         console.log("TTTTTTTTTTTTTTTTT");
    //     } else {
    //         plugin.displayModal();
    //     }
    // });

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
            plugin.operations.sync({
                local: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                    except: 1,
                },
                webdav: {},
            });
        },
    });

    plugin.addCommand({
        id: "pull",
        name: "Force PULL all File changes",
        callback: async () => {
            plugin.operations.sync({
                local: {},
                webdav: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                    except: 1,
                },
            });
        },
    });

    plugin.addCommand({
        id: "webdav-fullsync",
        name: "Full Sync",
        callback: async () => {
            plugin.operations.sync({
                local: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                },
                webdav: {
                    added: 1,
                    deleted: 1,
                    modified: 1,
                },
            });
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

    plugin.setStatus(Status.NONE);
    plugin.setClient();

    if (plugin.settings.liveSync) {
        plugin.setLiveSync();
    }

    if (plugin.settings.autoSync) {
        plugin.setAutoSync();
    }
}
