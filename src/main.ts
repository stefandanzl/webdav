import { TFile, TAbstractFile, Notice, Plugin } from "obsidian";
import { WebDAVClient } from "./webdav";
import {  } from "./settings";
import { FileTreeModal } from "./modal";
import { Checksum } from "./checksum";
import { Compare } from "./compare";
import { Operations } from "./operations";
import { join, emptyObj, sha1, log } from "./util";
import { launcher } from "./setup";
import { FileList, FileTree, PreviousObject, Status,CloudrSettings, DEFAULT_SETTINGS } from "./const";

export default class Cloudr extends Plugin {
    settings: CloudrSettings;
    compare: Compare;
    checksum: Checksum;
    operations: Operations;

    statusBar: HTMLElement;
    statusBar1: HTMLElement;
    statusBar2: HTMLElement;
    webdavPath: string;
    showModal: boolean;
    excluded: object;
    webdavClient: WebDAVClient;
    fileTrees: {
        webdavFiles: FileTree;
        localFiles: FileTree;
    };
    vaultName: string;
    baseLocal: string;
    baseWebdav: string;
    prevPath: string;
    prevData: PreviousObject;
    // prevDataSaveTimeoutId: NodeJS.Timeout | null;
    intervalId: number;
    status: Status;
    message: string;
    lastSync: number;

    skipLaunchSync: boolean;
    lastLiveSync: number;
    // LiveSyncTimeoutId: NodeJS.Timeout | null;
    liveSyncTimeouts: Record<string, NodeJS.Timeout | null> = {};
    connectionError: boolean;

    notice: Notice;
    pause: boolean;
    force: string;
    mobile: boolean;
    localFiles: FileList;
    webdavFiles: FileList;

    loadingTotal: number;
    loadingProcessed: number;

    // checkHidden: boolean;
    checkTime: number;
    testVal: boolean;
    // showLoading: boolean;

    onload() {
        // onLayoutReady(){
        launcher(this);
    }

    checkKeylaunchSync(ev: KeyboardEvent) {
        if (ev.altKey) {
            console.log("Alt key is currently pressed");
            this.skipLaunchSync = true;
            console.log("Skippy: ", this.skipLaunchSync);
            // Remove the event listener after detecting the key press
            document.removeEventListener("keydown", this.checkKeylaunchSync);
        }
    }

    async setClient() {
        try {
            this.webdavClient = this.operations.configWebdav(this.settings.url, this.settings.username, this.settings.password);
        } catch (error) {
            console.error("Webdav Client creation error.", error);
            this.show("Error creating Webdav Client!");
            // this.saveStateError(true)
            this.prevData;
        }
    }

    async setBaseWebdav() {
        if (this.settings.overrideVault) {
            this.baseWebdav = join(this.settings.webdavPath, this.settings.overrideVault).replace(/\\/g, "/");
        } else {
            this.baseWebdav = join(this.settings.webdavPath, this.app.vault.getName()).replace(/\\/g, "/");
        }
        log("Base webdav: ", this.baseWebdav);
    }

    async setAutoSync() {
        window.clearInterval(this.intervalId);

        if (this.settings.autoSync) {
            this.intervalId = window.setInterval(() => {
                log("AUTOSYNC INTERVAL TRIGGERED");
                this.operations.sync({
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
            }, this.settings.autoSyncInterval * 1000);
        }
    }

    async launchSyncCallback() {
        console.log("launchSyncCallback");
        console.log("testVal ", this.testVal);
        document.removeEventListener("keydown", this.checkKeylaunchSync);
        console.log("skip launchSyncCallback is ", this.skipLaunchSync);
        if (this.skipLaunchSync) {
            console.log("exit launchSyncCallback");
            return;
        }

        if (!this.prevData.error) {
 
            try {
                const ok = await this.test();
                if (ok) {
                    await this.operations.sync({
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

                    this.show("Launch Sync successful");
                }
            } catch {
                console.error("launchSync error");
                this.show("Launch Sync error");
            } finally {
                this.setStatus(Status.NONE);
            }
        } else {
            this.show("Previous Error detected, not allowing Launch Sync");
        }
    }

    async renewLiveSyncTimeout(abstractFile: TFile) {
        const filePath: string = abstractFile.path;
        const timeoutId = this.liveSyncTimeouts[filePath];
        if (timeoutId) {
            clearTimeout(timeoutId);
            delete this.liveSyncTimeouts[filePath];
        }

        // Schedule a 10-second delay
        this.liveSyncTimeouts[filePath] = setTimeout(() => {
            log("10 seconds have passed");
            this.liveSyncCallback(abstractFile);
        }, 10000);
    }

    async liveSyncCallback(abstractFile: TAbstractFile) {
        console.log("liveSync outer");
        if (abstractFile instanceof TFile) {
            if (this.status === Status.NONE) {
                if (this.connectionError === false) {
                    // console.log(Date.now() - this.lastLiveSync)
                    if (Date.now() - this.lastLiveSync < 5000) {
                        // We want some time between each Sync Process

                        this.renewLiveSyncTimeout(abstractFile);

                        return;
                    }
                } else {
                    console.log(Date.now() - this.lastLiveSync);
                    if (Date.now() - this.lastLiveSync < 20000) {
                        return;
                    }
                }

                this.lastLiveSync = Date.now();
                // this.status = ;

                // console.log("liveSync Inner");
                this.setStatus(Status.SYNC);
                try {
                    const file: TFile = abstractFile;

                    const filePath: string = file.path;

                    const timeoutId = this.liveSyncTimeouts[filePath];
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        delete this.liveSyncTimeouts[filePath];
                    }

                    if (
                        (this.fileTrees &&
                            this.fileTrees.localFiles &&
                            this.fileTrees.localFiles.except &&
                            this.fileTrees.localFiles.except.hasOwnProperty(filePath)) ||
                        (this.prevData.except && this.prevData.except.hasOwnProperty(filePath))
                    ) {
                        console.log("File is an exception!");
                        this.show("File " + filePath + " is an exception file!");
                        return;
                    }
                    // this.setStatus("🔄");

                    console.log(filePath);
                    const data = await this.app.vault.readBinary(file);
                    const hash = await sha1(data);

                    const remoteFilePath = join(this.baseWebdav, filePath);
                    await this.webdavClient.put(remoteFilePath, data);

                    this.prevData.files[filePath] = hash;
                    this.savePrevData();

                    this.setStatus(Status.NONE);
                    this.connectionError = false;
                } catch (error) {
                    // if (!this.connectionError){
                    // console.error("LiveSync Error: ",error);
                    console.log("LiveSync Connectivity ERROR!");
                    this.show("LiveSync Error");
                    this.connectionError = true;
                    this.lastLiveSync = Date.now();
                    // this.statusBar.setText("📴");

                    this.setStatus(Status.ERROR);
                }
            } else {
                this.renewLiveSyncTimeout(abstractFile);
            }
        }
    }

    setLiveSync() {
        // rather setLivePush
        if (this.settings.liveSync) {
            this.registerEvent(
                this.app.vault.on("modify", (file) => {
                    this.liveSyncCallback(file);
                })
            );
        } else {
            this.app.vault.off("modify", (file) => {
                if (file instanceof TAbstractFile || file instanceof TFile) {
                    this.liveSyncCallback(file);
                }
            });
        }
    }

    async openPullCallback(file: TFile | null) {
        console.log("openPull outer");
        if (this.status === Status.NONE && file instanceof TFile) {
            // this.lastLiveSync = Date.now()
            // this.status = "openPull";
            this.setStatus(Status.PULL);

            console.log("openPull Inner");
            try {
                // const file: TFile = abstractFile;

                const filePath: string = file.path;

                if (
                    (this.fileTrees &&
                        this.fileTrees.localFiles &&
                        this.fileTrees.localFiles.except &&
                        this.fileTrees.localFiles.except.hasOwnProperty(filePath)) ||
                    (this.prevData.except && this.prevData.except.hasOwnProperty(filePath))
                ) {
                    console.log("File is an exception!");
                    this.show("File " + filePath + " is an exception file!");
                    return;
                }
                // this.setStatus("🔄");

                console.log(filePath);
                const data = await this.app.vault.readBinary(file);
                // const hash = createHash('sha1').update(data).digest('hex');
                // const hash = CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
                // const hash = sha1.update(data).hex();
                const localHash = await sha1(data);

                //@ts-ignore
                const prevHash = this.prevData.files[filePath];

                console.log(this.prevData.files);

                const remoteFilePath = join(this.baseWebdav, filePath);

                // const res = await this.webdavClient.stat(remoteFilePath, {details: true})
                const remoteContent = await this.webdavClient.get(remoteFilePath);

                if (remoteContent.status === 200) {
                    const remoteHash = await sha1(remoteContent.data);

                    console.log("Local  ", localHash);
                    console.log("Prev   ", prevHash);
                    console.log("Remote ", remoteHash);

                    console.log(Date.now());
                    console.log(file.stat.ctime);

                    // SPECIFIC CASE FOR DAILY NOTES SCENARIO
                    if (prevHash === undefined && localHash !== remoteHash && remoteHash !== undefined) {
                        if (Date.now() - file.stat.ctime < 60_000) {
                            // file just was created locally but the same file has already existed remotely
                            console.log("File was just created! ", Date.now() - file.stat.ctime);

                            this.app.vault.modifyBinary(file, remoteContent.data);
                        } else {
                            console.log("File too old!");
                        }
                    }
                } else {
                    console.log("FILE STATUS: ", remoteContent.status);
                }

                this.setStatus(Status.NONE);
                this.connectionError = false;
            } catch (error) {
                if (error instanceof Error && error.message.includes("404")) {
                    // Handle 404 Not Found error
                    console.log("File not found:", error.message);
                    // Additional error handling or UI updates for 404 error
                } else {
                    console.error(error);
                }

                // if (!this.connectionError){
                // console.error("LiveSync Error: ",error);
                console.log("OpenPull Connectivity ERROR!");
                this.show("OpenPull Error");
                this.connectionError = true;
                // this.lastLiveSync = Date.now()
                // this.statusBar.setText("📴");

                this.setStatus(Status.ERROR);
            }
        }
    }

    setOpenPull() {
        // set
        if (this.settings.openPull) {
            this.registerEvent(
                this.app.workspace.on("file-open", (file) => {
                    this.openPullCallback(file);
                })
            ); //vault.on("modify",(file)=>{this.liveSyncCallback(file)}))
        } else {
            this.app.workspace.off("file-open", (file) => {
                if (!(file instanceof TFile)) {
                    return;
                }

                this.openPullCallback(file);
            });
        }
    }

    async errorWrite() {
        // this.prevData.error = true;
        this.setError(true);
        this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
    }

    async test(show = true, force = false) {
        if (!force && (this.status !== Status.NONE && this.status !== Status.OFFLINE )) {
            show && this.show(`Testing not possible, currently ${this.status}`);
            return;
        }

        this.setStatus(Status.TEST);
        show && this.show(`${Status.TEST} Testing ...`);

        try {
            const existBool = await this.webdavClient.exists(this.settings.webdavPath);
            log("EXISTS: ", existBool);

            if (existBool) {
                show && this.show("Connection successful");
                this.setStatus(Status.NONE);
            } else {
                this.show("Connection failed");
                this.setStatus(Status.OFFLINE);
            }
            this.setError(!existBool);
            return existBool;
        } catch (error) {
            show && this.show(`WebDAV connection test failed. Error: ${error}`);

            this.setStatus(Status.ERROR);
            this.setError(true);
            return false;
        }
    }

    fileTreesEmpty(button = true) {
        const f = this.fileTrees;

        if (emptyObj(f)) {
            return true;
        }

        if (
            emptyObj(f.localFiles.added) &&
            emptyObj(f.localFiles.deleted) &&
            emptyObj(f.localFiles.modified) &&
            emptyObj(f.webdavFiles.added) &&
            emptyObj(f.webdavFiles.deleted) &&
            emptyObj(f.webdavFiles.modified)
        ) {
            if (emptyObj(f.webdavFiles.except) && emptyObj(f.localFiles.except)) {
                button && this.show("Nothing to sync");
                return true;
            } else {
                button && this.show("Please open control panel to solve your file exceptions");
                return true;
            }
        }
        return false;
    }

    async setError(error: boolean) {
        this.prevData.error = error;
        if (error) {
            this.setStatus(Status.ERROR);
        }
        // this.setStatus("")
        this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
    }

    // default true in order for except to be updated
    async saveState(check = false) {
        log("save state");
        const action = "save";
        if (this.prevData.error) {
            if (this.force !== action) {
                this.setForce(action);
                this.show("Error detected - please clear in control panel or force action by retriggering " + action);
                return;
            }
        }
        if (this.status === Status.NONE && !this.prevData.error ) {
            this.setStatus(Status.SAVE);
            try {
                this.prevData.files = await this.checksum.generateLocalHashTree(false);

                this.prevData = {
                    date: Date.now(),
                    error: this.prevData.error,
                    files: this.prevData.files,
                    except: this.fileTrees.localFiles.except,
                };

                await this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
                console.log("saving successful!");
                this.show("Saved current vault state!");
            } catch (error) {
                console.log("Error occurred while saving State. ", error);
                console.error("SAVESTATE", error);
                // this.saveStateError(true)
                // this.prevData.error  = true
                this.setError(true);
                return error;
            } finally {
                this.setStatus(Status.NONE);
            }
        } else {
          this.show(`Saving not possible because of ${this.status} \nplease clear Error in Control Panel`)
            console.log("Action currently active: ", this.status, "\nCan't save right now!");
        }
    }

    async savePrevData() {
        try {
            await this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2));
            console.log("saving prevData successful!");
            // this.prevDataSaveTimeoutId = null;
        } catch (error) {
            console.error("prevData   ", error);
        }
    }

    async initRemote() {
        //
        await this.operations.deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.webdavFiles);
        await this.operations.uploadFiles(this.webdavClient, this.localFiles, this.baseWebdav);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calcTotal(...rest: Record<string, any>[]) {
        log("REST: ", rest);
        this.loadingProcessed = 0;
        let total = 0;
        for (const i of rest) {
            total += Object.keys(i).length;
        }
        this.loadingTotal = total;
        this.statusBar2.setText(" 0/" + this.loadingTotal);
        return total;
    }

    async finished() {
        await sleep(2000);
        this.statusBar2.setText("");
    }

    async setStatus(status: Status, text?: string) {
        this.status = status;

        if (text) {
            this.statusBar.setText(text);
            return;
        }

        if (this.connectionError) {
            this.statusBar.setText(Status.OFFLINE);
            this.statusBar.style.color = "red";
            return;
        }
        this.statusBar.setText(status);
        // if (status === Status.NONE) {
        //     if (this.prevData.error) {
        //         this.statusBar.setText(Status.ERROR);
        //         this.statusBar.style.color = "red";
        //         return;
        //     } else {
        //         this.statusBar.setText(Status.OK);
        //         this.statusBar.style.color = "var(--status-bar-text-color)";
        //         return;
        //     }
        // } else {
        //     this.statusBar.setText(text as string);
        //     this.statusBar.style.color = "var(--status-bar-text-color)";
        // }
    }

    async processed() {
        this.loadingProcessed++;
        console.log(this.loadingProcessed.toString() + "/" + this.loadingTotal);
        this.statusBar2.setText(this.loadingProcessed.toString() + "/" + this.loadingTotal);
    }

    async setForce(action: string) {
        this.force = action;
        // await sleep(5000)
        // this.force = ""
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
      const modal = new FileTreeModal(this.app, this)
      modal.open();

        if (!this.fileTrees) {
            const response = await this.operations.check();
            if (response){
              modal.fileTreeDiv.setText(JSON.stringify(this.fileTrees, null, 2));
            } else {
              modal.fileTreeDiv.setText("Checking failed!")
            }
            
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    show(message: string = "Alert!", duration?: number) {
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
