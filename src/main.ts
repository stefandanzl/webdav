import { TFile, TAbstractFile, Notice, Plugin, setIcon } from "obsidian";
import { WebDAVClient } from "./webdav";
import {} from "./settings";
import { FileTreeModal } from "./modal";
import { Checksum } from "./checksum";
import { Compare } from "./compare";
import { Operations } from "./operations";
import { join, sha1 } from "./util";
import { launcher } from "./setup";
import { FileList, PreviousObject, Status, CloudrSettings, DEFAULT_SETTINGS, STATUS_ITEMS, FileTrees, Hash, Location, Type } from "./const";

export default class Cloudr extends Plugin {
    doLog: boolean;
    settings: CloudrSettings;
    compare: Compare;
    checksum: Checksum;
    operations: Operations;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settingPrivate: any;

    statusBar: HTMLElement;
    statusBar1: HTMLElement;
    statusBar2: HTMLElement;
    iconSpan: HTMLSpanElement;
    modal: FileTreeModal;

    webdavPath: string;
    showModal: boolean;
    webdavClient: WebDAVClient;
    fileTrees: FileTrees;
    fullFileTrees: FileTrees;
    allFiles: {
        local: FileList;
        webdav: FileList;
    };
    baseWebdav: string;
    prevPath: string;
    prevData: PreviousObject;

    intervalId: number;
    status: Status;
    lastFileEdited: string;
    lastLiveSync: number;
    liveSyncTimeouts: Record<string, NodeJS.Timeout | null> = {};

    notice: Notice;
    pause: boolean;

    mobile: boolean;
    localFiles: FileList;
    webdavFiles: FileList;

    loadingTotal: number;
    loadingProcessed: number;
    checkTime: number;
    lastScrollPosition: number;
    tempExcludedFiles: Record<
        string,
        {
            location: Location;
            type: Type;
            hash: Hash;
        }
    >;

    onload() {
        launcher(this);
    }

    log(...text: string[] | unknown[]) {
        /**
         * Set this value for excessive log output
         *
         */
        // const doLog = true;
        if (this.doLog) {
            console.log(...text);
        }
    }

    async setClient() {
        try {
            this.webdavClient = this.operations.configWebdav(this.settings.url, this.settings.username, this.settings.password);
        } catch (error) {
            console.error("Webdav Client creation error.", error);
            this.show("Error creating Webdav Client!");
            this.prevData;
        }
    }

    async setBaseWebdav() {
        if (this.settings.overrideVault) {
            this.baseWebdav = join(this.settings.webdavPath, this.settings.overrideVault).replace(/\\/g, "/");
        } else {
            this.baseWebdav = join(this.settings.webdavPath, this.app.vault.getName()).replace(/\\/g, "/");
        }
        this.log("Base webdav: ", this.baseWebdav);
    }

    async setAutoSync() {
        window.clearInterval(this.intervalId);

        if (this.settings.autoSync) {
            this.intervalId = window.setInterval(async () => {
                this.log("AUTOSYNC INTERVAL TRIGGERED");
                // if (Date.now() - this.checkTime > 30*1000){

                if (this.status === Status.OFFLINE) {
                    const response = await this.operations.test(false);
                    if (!response) {
                        return;
                    } else {
                        this.setStatus(Status.NONE);
                    }
                }

                if (this.status !== Status.NONE) {
                    console.log("Cant Autosync because ", this.status);
                    return;
                }

                if (!(await this.operations.check(false))) {
                    return;
                }

                await this.operations.sync(
                    {
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
                    },
                    false
                );
                // }
            }, this.settings.autoSyncInterval * 1000);
        }
    }
    async renewLiveSyncTimeout(abstractFile: TFile, attempt = 0) {
        const filePath: string = abstractFile.path;
        const timeoutId = this.liveSyncTimeouts[filePath];
        if (timeoutId) {
            clearTimeout(timeoutId);
            delete this.liveSyncTimeouts[filePath];
        }

        const delay = Math.min(10000 * Math.pow(1.5, attempt), 60000); // Cap at 1 minute

        this.liveSyncTimeouts[filePath] = setTimeout(() => {
            this.log(`Live Sync: ${delay / 1000} seconds have passed`);
            this.liveSyncCallback(abstractFile);
        }, delay);
    }

    async liveSyncCallback(abstractFile: TAbstractFile) {
        this.log("liveSync outer");
        if (abstractFile instanceof TFile) {
            // const now = Date.now();
            // const minInterval = this.connectionError ? 20000 : 5000;

            // if (now - this.lastLiveSync < minInterval) {
            //     this.renewLiveSyncTimeout(abstractFile);
            //     return;
            // }

            if (this.status === Status.NONE || this.status === Status.OFFLINE) {
                this.lastLiveSync = Date.now();

                this.setStatus(Status.AUTO);
                try {
                    const file: TFile = abstractFile;
                    const filePath: string = file.path;

                    const timeoutId = this.liveSyncTimeouts[filePath];
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        delete this.liveSyncTimeouts[filePath];
                    }

                    this.log(filePath);
                    const data = await this.app.vault.readBinary(file);
                    const hash = await sha1(data);

                    const remoteFilePath = join(this.baseWebdav, filePath);
                    const response = await this.webdavClient.put(remoteFilePath, data);
                    if (!response) {
                        this.setStatus(Status.OFFLINE);
                        this.renewLiveSyncTimeout(abstractFile);
                        return;
                    }

                    this.prevData.files[filePath] = hash;
                    this.savePrevData();

                    this.setStatus(Status.NONE);
                } catch (error) {
                    console.log("LiveSync Connectivity ERROR!");
                    this.show("LiveSync Error");
                    this.lastLiveSync = Date.now();
                    this.setStatus(Status.ERROR);
                }
            } else {
                this.renewLiveSyncTimeout(abstractFile);
            }
        }
    }

    setLiveSync() {
        const modifyHandler = (file: TAbstractFile) => {
            if (file instanceof TFile) {
                this.lastFileEdited = file.path;
                this.liveSyncCallback(file);
            }
        };

        if (this.settings.liveSync) {
            this.registerEvent(this.app.vault.on("modify", modifyHandler));
        } else {
            this.app.vault.off("modify", modifyHandler);
        }
    }
    async errorWrite() {
        // this.prevData.error = true;
        this.setError(true);
        this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
    }

    async setError(error: boolean) {
        console.error("Error detected and saved to prevData");
        this.show("Error detected and saved to prevData!");
        this.prevData.error = error;
        if (error) {
            this.setStatus(Status.ERROR);
        }
        // this.setStatus("")
        this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
    }

    // default true in order for except to be updated
    async saveState(checkLocal = false) {
        this.log("save state");
        const action = "save";
        if (this.prevData.error) {
            this.show("Error detected - please clear in control panel or force action by retriggering " + action);
            console.log("SAVE ERROR OCCURREDDD");
            console.error("SAVESPACE COMPROMISED, PANIC!");
            return;
        }
        if (this.status === Status.NONE && !this.prevData.error) {
            this.setStatus(Status.SAVE);
            try {
                // if (checkLocal || emptyObj(this.allFiles.local)) {
                // const oldPrevData = this.prevData.files;
                /**
                 * IMPORTANT! generateLocalHashTree must be given false in order for ALL files to be properly added to your previous files.
                 * Otherwise they may be seen as "added" or "deleted"
                 */
                const files = await this.checksum.generateLocalHashTree(false);

                Object.keys(this.tempExcludedFiles).forEach((path) => {
                    // we have to differentiate between added, deleted and edited.
                    if (this.tempExcludedFiles[path].location === "localFiles"){
                    switch (this.tempExcludedFiles[path].type) {
                        case "added":
                            // Do not write to prevData

                            break;
                    case "deleted":
                            // Write to prevData
                            files[path] = this.tempExcludedFiles[path].hash;
                        break;
                    case "modified":
                        // Write old hash again to prevData
                        files[path] = this.prevData.files[path];
                        break;
                        default:

                            break;
                    }
                } else if (this.tempExcludedFiles[path].location === "webdavFiles"){
                    switch (this.tempExcludedFiles[path].type) {
                        case "added":
                            // Do not write to prevData

                            break;
                    case "deleted":
                            // Write to prevData
                            // files[path] = this.tempExcludedFiles[path].hash;
                        break;
                    case "modified":
                        // Write old hash again to prevData
                        // files[path] = this.prevData.files[path];
                        break;
                        default:

                            break;
                    }
                } else {
                    // except
                    // will already not be treated by sync
                    // TODO: add additional click handler for except area
                }


                    files[path as keyof FileList] = this.prevData.files[path as keyof PreviousObject] ;
                });
  
                const newExcept = this.compare.checkExistKey(this.fileTrees.localFiles.except, files)

                this.prevData = {
                    date: Date.now(),
                    error: this.prevData.error,
                    files,
                    except: newExcept,
                };

                await this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
                console.log("saving successful!");
                this.show("Saved current vault state!");
            } catch (error) {
                console.log("Error occurred while saving State. ", error);
                console.error("SAVESTATE", error);
                this.setError(true);
                return error;
            } finally {
                this.setStatus(Status.NONE);
            }
        } else {
            this.show(`Saving not possible because of ${this.status} \nplease clear Error in Control Panel`);
            console.log("Action currently active: ", this.status, "\nCan't save right now!");
        }
    }

    async savePrevData() {
        try {
            await this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
            this.log("saving prevData successful!");
            // this.prevDataSaveTimeoutId = null;
        } catch (error) {
            console.error("prevData   ", error);
        }
    }

    async initRemote() {
        //
        await this.operations.deleteFilesWebdav(this.webdavFiles);
        await this.operations.uploadFiles(this.localFiles);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calcTotal(...rest: Record<string, any>[]) {
        this.log("REST: ", rest);
        this.loadingProcessed = 0;
        let total = 0;
        for (const i of rest) {
            total += Object.keys(i).length;
        }
        this.loadingTotal = total;
        // this.statusBar2.setText(" 0/" + this.loadingTotal);
        return total;
    }

    async finished() {
        await sleep(2000);
        this.statusBar2.setText("");
    }

    async processed() {
        this.loadingProcessed++;
        this.log(this.loadingProcessed.toString() + "/" + this.loadingTotal);
        this.statusBar2.setText(this.loadingProcessed.toString() + "/" + this.loadingTotal);
    }

    togglePause() {
        this.pause = !this.pause;

        console.log(this.status);
        if (this.pause) {
            this.setStatus(Status.PAUSE);
        } else {
            this.setStatus(Status.NONE);
        }
    }

    async displayModal() {
        this.modal = new FileTreeModal(this.app, this);
        this.modal.open();
    }

    /**
     * 
     * @param message - What is on your Toast?
     * @param duration - Time in milliseconds
     */
    show(message: string, duration?: number) {
        if (this.notice) {
            this.notice.hide();
        }

        const fragment = document.createDocumentFragment();
        const divElement = document.createElement("div");
        divElement.textContent = message;
        // divElement.setAttribute("style", "white-space: pre-wrap;");
        divElement.style.whiteSpace = "pre-wrap";

        fragment.appendChild(divElement);
        this.notice = new Notice(fragment, duration);
    }

    async setStatus(status: Status, show = true, text?: string) {
        this.status = status;

        // this.app.vault.fileMap

        if (text) {
            this.statusBar.setText(text);
            return;
        }

        // show && this.statusBar.setText(status);
        if (show) {
            // Update status method
            //  updateSyncStatus(status: 'error' | 'syncing' | 'success') {
            // this.iconSpan.removeClass("mod-error", "mod-syncing", "mod-success", );
            // this.iconSpan.addClass(`mod-${STATUS_ITEMS[status].class}`);
            this.iconSpan.setCssProps({ color: STATUS_ITEMS[status].color });
            this.statusBar.setAttribute("aria-label", STATUS_ITEMS[status].label);
            setIcon(this.iconSpan, STATUS_ITEMS[status].lucide);
        }
    }

    onunload() {
        window.clearInterval(this.intervalId);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
