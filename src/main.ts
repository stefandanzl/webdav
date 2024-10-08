
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  FileSystemAdapter,
  TFile,
  TAbstractFile,
  Notice,
  Plugin,
  Platform, // App, Editor, MarkdownView, Modal, PluginSettingTab, Setting
} from "obsidian";

// import { readdirSync } from 'fs';
import { WebDAVClient } from "webdav";
import {
  CloudrSettings,
  DEFAULT_SETTINGS,
  CloudrSettingsTab,
  FileTreeModal,
} from "./settings";
import {
  Checksum, //generateLocalHashTree, generateWebdavHashTree
} from "./checksum";
import { Compare } from "./compare";
import {
  Operations,
  //downloadFiles, uploadFiles, deleteFilesLocal, deleteFilesWebdav, join, configWebdav, emptyObj
} from "./operations";
// import { createHash } from 'crypto';
import {
  join,
  emptyObj, //sha1
} from "./util";


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
    webdavFiles: {
      added: object;
      deleted: object;
      modified: object;
      except: object;
    };
    localFiles: {
      added: object;
      deleted: object;
      modified: object;
      except: object;
    };
  };
  vaultName: string;
  baseLocal: string;
  baseWebdav: string;
  prevPath: string;
  prevData: {
    date?: number;
    error: boolean;
    files: object;
    except?: object;
  };
  // prevDataSaveTimeoutId: NodeJS.Timeout | null;
  intervalId: number;
  status: string;
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
  localFiles: object;
  webdavFiles: object;

  loadingTotal: number;
  loadingProcessed: number;

  // checkHidden: boolean;
  checkTime: number;
  testVal: boolean;
  // showLoading: boolean;

  async onload() {
    await this.loadSettings();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new CloudrSettingsTab(this.app, this));

    this.compare = new Compare(this);
    this.checksum = new Checksum(this);
    this.operations = new Operations(this);

    this.mobile = Platform.isMobileApp;

    this.connectionError = false;

    this.skipLaunchSync = false;
    this.testVal = false;

    if (this.settings.launchSync) {
      document.addEventListener("keydown", this.checkKeylaunchSync, {
        once: true,
      });
    }
    // // this.checkHidden = !this.mobile;
    // this.checkHidden = true;
    // console.log("MOBILE: ",this.mobile,"\ncheckHidden",this.checkHidden)

    // const adapter = this.app.vault.adapter;
    // if (adapter instanceof FileSystemAdapter) {
    //     this.baseLocal = adapter.getBasePath().replace(/\\/g, '/') + "/";
    //     // console.log("Base local: ", this.baseLocal)

    // } else { console.log("ERROR Localpath") }
    this.settings.exclusionsOverride = false;

    this.setBaseWebdav();

    this.prevPath = `${this.app.vault.configDir}/plugins/webdav/prevdata.json`;
    // console.log(this.prevPath)

    if (this.settings.enableRibbons) {
      this.addRibbonIcon("upload-cloud", "PUSH to Webdav", () => {
        this.push();
      });

      this.addRibbonIcon("download-cloud", "PULL from Webdav", () => {
        this.pull();
      });
    }

    this.addRibbonIcon("arrow-down-up", "SYNC with Webdav", () => {
      this.fullSync();
    });

    this.addRibbonIcon("settings-2", "Open WebDav Control Panel", () => {
      this.displayModal();
    });

    try {
      this.prevData = JSON.parse(
        await this.app.vault.adapter.read(this.prevPath)
      );
      // prevData.date = new Date(prevData.date)
      // this.prevData = prevData

      console.log("PREVDATA LOADED: ", this.prevData);
    } catch {
      this.prevData = {
        error: true,
        files: {},
      };

      this.app.vault.adapter.write(
        this.prevPath,
        JSON.stringify(this.prevData, null, 2)
      );
      console.error(
        "ERROR LOADING PREVIOUS DATA! RESET prev.json to {error: true, files: {}} "
      );
    }

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.

    this.statusBar = this.addStatusBarItem();
    // this.statusBar = statusBar.createEl(
    //     "div",{ text: 'WEBDAV', cls: 'status-bar-item mod-clickable' }
    // );

    // // Create the first div
    // this.statusBar1 = this.statusBar.createDiv();
    // this.statusBar1.setText('First Div');
    // this.statusBar1.style.marginRight = '10px'; // Adjust the margin as needed

    // // Create the second div
    // this.statusBar2 = this.statusBar.createDiv();
    this.statusBar2 = this.addStatusBarItem();
    this.statusBar2.setText("");

    this.loadingTotal = -1;

    // Optional: Apply additional styling if needed
    this.statusBar.style.display = "flex"; // Make the status bar a flex container

    this.statusBar.style.width = "25px";
    this.statusBar.style.color = "green";

    this.statusBar.classList.add("status-bar-item");
    this.statusBar.classList.add("mod-clickable");

    // this.statusBar.setText('OFF');
    this.statusBar.addEventListener("click", () => {
      if (this.app.lastEvent && this.app.lastEvent.ctrlKey) {
        console.log("TTTTTTTTTTTTTTTTT");
      } else {
        this.displayModal();
      }
    });

    this.addCommand({
      id: "display-modal",
      name: "Display modal",
      callback: async () => {
        this.displayModal();
      },
    });

    this.addCommand({
      id: "push",
      name: "Force PUSH all File changes",
      callback: async () => {
        this.push();
      },
    });

    this.addCommand({
      id: "pull",
      name: "Force PULL all File changes",
      callback: async () => {
        this.pull();
      },
    });

    this.addCommand({
      id: "webdav-fullsync",
      name: "Full Sync",
      callback: async () => {
        this.fullSync();
      },
    });

    this.addCommand({
      id: "save-prev",
      name: "Save State",
      callback: async () => {
        this.saveState();
      },
    });

    this.addCommand({
      id: "reset-error",
      name: "Reset Error state",
      callback: async () => {
        // this.prevData.error= false
        this.setError(false);
      },
    });

    this.addCommand({
      id: "delete-local",
      name: "Delete pending local files",
      callback: () => {
        this.operations.deleteFilesLocal(this.fileTrees.webdavFiles.deleted);
      },
    });

    this.addCommand({
      id: "delete-webdav",
      name: "Delete pending webdav files",
      callback: () => {
        this.operations.deleteFilesWebdav(
          this.webdavClient,
          this.baseWebdav,
          this.fileTrees.localFiles.deleted
        );
      },
    });

    this.addCommand({
      id: "toggle-pause-all",
      name: "Toggle Pause for all activities",
      callback: () => {
        this.togglePause();
      },
    });

    this.setStatus("");
    this.setClient();

    if (this.settings.liveSync) {
      this.setLiveSync();
    }

    if (this.settings.autoSync) {
      this.setAutoSync();
    }

    if (this.settings.openPull) {
      this.setOpenPull();
    }

    if (this.settings.launchSync) {
      this.app.workspace.onLayoutReady(() => {
        this.testVal = true;
        this.launchSyncCallback();
      });
    }
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
      this.webdavClient = this.operations.configWebdav(
        this.settings.url,
        this.settings.username,
        this.settings.password
      );
    } catch (error) {
      console.error("Webdav Client creation error.", error);
      this.show("Error creating Webdav Client!");
      // this.saveStateError(true)
      this.prevData;
    }
  }

  async setBaseWebdav() {
    if (this.settings.overrideVault) {
      this.baseWebdav = join(
        this.settings.webdavPath,
        this.settings.overrideVault
      ).replace(/\\/g, "/");
    } else {
      this.baseWebdav = join(
        this.settings.webdavPath,
        this.app.vault.getName()
      ).replace(/\\/g, "/");
    }
    console.log("Base webdav: ", this.baseWebdav);
  }

  async setAutoSync() {
    window.clearInterval(this.intervalId);

    if (this.settings.autoSync) {
      this.intervalId = window.setInterval(() => {
        console.log("AUTOSYNC INTERVAL TRIGGERED");
        this.fullSync(false);
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
      // this.setStatus("🚀");

      // setTimeout(()=>{
      //     console.log("waiting over")
      // }, 500)

      // if (this.mobile === false && this.app.lastEvent?.altKey === true){
      //     this.show("Alt key pressed to skip Launch")
      //     return
      // }
      try {
        const ok = await this.test();
        if (ok) {
          await this.fullSync();

          this.show("Launch Sync successful");
        }
      } catch {
        console.error("launchSync error");
        this.show("Launch Sync error");
      } finally {
        this.setStatus("");
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
      console.log("10 seconds have passed");
      this.liveSyncCallback(abstractFile);
    }, 10000);
  }

  async liveSyncCallback(abstractFile: TAbstractFile) {
    console.log("liveSync outer");
    if (abstractFile instanceof TFile) {
      if (!this.status) {
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
        this.status = "livesync";

        console.log("liveSync Inner");

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
            (this.prevData.except &&
              this.prevData.except.hasOwnProperty(filePath))
          ) {
            console.log("File is an exception!");
            this.show("File " + filePath + " is an exception file!");
            return;
          }
          this.setStatus("🔄");

          console.log(filePath);
          const data = await this.app.vault.read(file);
          // const hash = createHash('sha1').update(data).digest('hex');
          // const hash = CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
          // const hash = sha1.update(data).hex();
          const hash = this.checksum.sha1(data);

          const remoteFilePath = join(this.baseWebdav, filePath);
          await this.webdavClient.putFileContents(remoteFilePath, data);

          // @ts-ignore
          this.prevData.files[filePath] = hash;
          // await sleep(1000)
          // this.prevDataSaveTimeoutId = setTimeout(() => {
          //     console.log('Timeout triggered');
          //   }, 15_000);
          this.savePrevData();

          // this.status = ""
          this.setStatus("");
          this.connectionError = false;
        } catch (error) {
          // if (!this.connectionError){
          // console.error("LiveSync Error: ",error);
          console.log("LiveSync Connectivity ERROR!");
          this.show("LiveSync Error");
          this.connectionError = true;
          this.lastLiveSync = Date.now();
          // this.statusBar.setText("📴");

          // }

          // this.status = "";
          this.setStatus("");
        }
        // finally {

        // this.status = ""
        // this.setStatus("")
        // }
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
    if (!this.status && file instanceof TFile) {
      // if (this.connectionError === false){
      //     // console.log(Date.now() - this.lastLiveSync)
      //     if (Date.now() - this.lastLiveSync < 5000){

      //         return;
      //     }
      // } else {
      //     console.log(Date.now() - this.lastLiveSync)
      //     if (Date.now() - this.lastLiveSync < 20000){

      //         return;
      //     }
      // }

      // this.lastLiveSync = Date.now()
      this.status = "openPull";

      console.log("openPull Inner");
      try {
        // const file: TFile = abstractFile;

        const filePath: string = file.path;

        if (
          (this.fileTrees &&
            this.fileTrees.localFiles &&
            this.fileTrees.localFiles.except &&
            this.fileTrees.localFiles.except.hasOwnProperty(filePath)) ||
          (this.prevData.except &&
            this.prevData.except.hasOwnProperty(filePath))
        ) {
          console.log("File is an exception!");
          this.show("File " + filePath + " is an exception file!");
          return;
        }
        this.setStatus("🔄");

        console.log(filePath);
        const data = await this.app.vault.read(file);
        // const hash = createHash('sha1').update(data).digest('hex');
        // const hash = CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
        // const hash = sha1.update(data).hex();
        const localHash = this.checksum.sha1(data);

        //@ts-ignore
        const prevHash = this.prevData.files[filePath];

        console.log(this.prevData.files);

        const remoteFilePath = join(this.baseWebdav, filePath);
        // await this.webdavClient.putFileContents(remoteFilePath, data);

        // const res = await this.webdavClient.stat(remoteFilePath, {details: true})
        const remoteContent = (await this.webdavClient.getFileContents(
          remoteFilePath,
          { format: "text" }
        )) as string;
        if (remoteContent !== null && remoteContent !== undefined) {
          // console.log(res);
          //     //@ts-ignore
          //     const remoteChksm = res.data.props?.checksum
          // console.log(remoteContent)
          const remoteHash = this.checksum.sha1(remoteContent);

          console.log("Local  ", localHash);
          console.log("Prev   ", prevHash);
          console.log("Remote ", remoteHash);

          // console.log(remoteChksm, " AND ",hash)

          // if (localHash !== remoteHash ){
          //     if (prevHash === undefined ||
          //         (prevHash === localHash && prevHash !== undefined)){

          //         }
          // }
          console.log(Date.now());
          console.log(file.stat.ctime);

          // SPECIFIC CASE FOR DAILY NOTES SCENARIO
          if (
            prevHash === undefined &&
            localHash !== remoteHash &&
            remoteHash !== undefined
          ) {
            if (Date.now() - file.stat.ctime < 60_000) {
              // file just was created locally but the same file has already existed remotely
              console.log(
                "File was just created! ",
                Date.now() - file.stat.ctime
              );

              this.app.vault.modify(file, remoteContent);
            } else {
              console.log("File too old!");
            }
          }

          // if (remoteHash !== prevHash && prevHash === localHash
          //     && prevHash !== undefined){
          //     // Remote file was changed
          //     console.log("!\n!\n!! Remote UPDATE DETECTED!!\n!")

          //     if (Date.now() - file.stat.ctime < 60_000){
          //         console.log("\nThis file just was created!")

          //         this.app.vault.modify(file, remoteContent)
          //     } else {
          //         console.log("nothing done ...")
          //     }

          // }
        } else {
          console.log("error, nothing responded");
        }

        // const after = Date.now()

        // console.log("\nDuration: ",after - before)

        // @ts-ignore
        // this.prevData.files[filePath] = remoteChks;
        // await sleep(1000)

        // this.status = ""
        this.setStatus("");
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

        this.setStatus("");
      }
    }
  }

  setOpenPull() {
    // set
    if (this.settings.openPull) {
      // this.registerEvent(this.app.workspace.on("active-leaf-change",()=>{
      //    const file = this.app.workspace.getActiveFile()

      //     if (file){
      //     console.log(file.path)
      //     }
      //     else {
      //         console.log("NOOONE")
      //     }
      // }))

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
    this.app.vault.adapter.write(
      this.prevPath,
      JSON.stringify(this.prevData, null, 2)
    );
  }

  async test(button = true) {
    try {
      this.setStatus("🧪");
      this.show("🧪 Testing ...");

      const directoryContents = await this.webdavClient.getDirectoryContents(
        this.settings.webdavPath
      );

      // Filter out only directories
      // @ts-ignore
      const directories = directoryContents.filter(
        (item: { type: string }) => item.type === "directory"
      );

      // Print the list of directories
      // @ts-ignore
      const directoryList = directories.map((dir) => dir.filename).join("\n");
      console.log(
        `Directories at /${this.settings.webdavPath}:\n${directoryList}`
      );

      if (button) {
        this.show(
          `Directories at /${this.settings.webdavPath}:\n${directoryList}`
        );
      }

      // If successful, log the results
      console.log(
        "WebDAV connection test successful. Directory contents:",
        JSON.stringify(directoryContents, null, 2)
      );
      // this.prevData.error = false;
      this.setError(false);
      return true;
    } catch (error) {
      // If an error occurs, log the error details
      console.error(`WebDAV connection test failed. Error:`, error);
      if (button) {
        this.show(`WebDAV connection test failed. Error: ${error}`);
      }
      // this.prevData.error = true;
      this.setError(true);
      return false;
    } finally {
      this.setStatus("");
    }
  }

  async check(button = true) {
    if (this.status != "🔎" && (!button || !this.status)) {
      //disable status check if button = false for fullsync etc.
      this.setStatus("🔎");
      this.show("🔎 Checking ...");

      try {
        const dir = await this.webdavClient.getDirectoryContents(
          this.settings.webdavPath
        );

        if (dir) {
          // this.prevData.error = false
          this.setError(false);
        }
      } catch (error) {
        this.show("No Connection to server! \n" + error.message);
        console.error("CHECK Connection issue: ", error);
        // this.prevData.error = true
        this.setError(true);
        this.setStatus("");
        return error;
      }
      console.log("GAAAAAAAAAA");

      try {
        this.checkTime = Date.now();

        const webdavPromise = this.checksum.generateWebdavHashTree(
          this.webdavClient,
          this.baseWebdav,
          this.settings.exclusions
        );

        const localPromise = this.checksum.generateLocalHashTree();

        // Use Promise.all to execute both promises simultaneously
        const [webdavFiles, localFiles] = await Promise.all([
          webdavPromise,
          localPromise,
        ]);

        console.log("WEBDAV:", webdavFiles);
        console.log("LOCAL", JSON.stringify(localFiles, null, 2));
        ///////// Check if valid response

        const comparedFileTrees = await this.compare.compareFileTrees(
          webdavFiles,
          localFiles,
          this.prevData,
          this.settings.exclusions
        );
        console.log(JSON.stringify(comparedFileTrees, null, 2));
        this.fileTrees = comparedFileTrees;

        button &&
          (this.fileTreesEmpty() ? null : this.show("Finished checking files"));
        // if (this.mobile){this.checkHidden = true;}
        return true;
      } catch (error) {
        console.log("CHECK ERROR: ", error);
        button && this.show("CHECK ERROR: ", error);
        console.error("CHECK", error);
        // this.saveStateError(true)
        // this.prevData.error = true
        this.setError(true);
        return error;
      } finally {
        this.setStatus("");
      }
    } else {
      console.log("Action currently active: ", this.status);
      button && this.show("Currently active: " + this.status);
    }
  }

  async pull(button = true, inverted = false) {
    if (this.prevData.error) {
      const action = "pull";
      if (this.force !== action) {
        this.setForce(action);
        button &&
          this.show(
            "Error detected - please clear in control panel or force action by retriggering " +
              action
          );
        return;
      }
    }
    if (!this.status) {
      try {
        this.setStatus("⬇️");
        this.status = "pull";
        if (!(await this.test(false))) {
          this.show("Connection Problem detected!");
          return;
        }
        if (!this.fileTrees) {
          button && this.show("Checking files before pulling ...");
          console.log("NO FILETREES ");
          await this.check();
          // button && this.show("");
        }

        const f = this.fileTrees;
        if (
          !inverted &&
          button &&
          emptyObj(f.webdavFiles.added) &&
          emptyObj(f.webdavFiles.deleted) &&
          emptyObj(f.webdavFiles.modified)
        ) {
          if (emptyObj(f.webdavFiles.except)) {
            button && this.show("Nothing to pull");
            return;
          }
          // else {
          //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
          //     return
          // }
        }
        this.calcTotal(
          this.fileTrees.webdavFiles.added,
          this.fileTrees.webdavFiles.modified,
          this.fileTrees.webdavFiles.deleted,
          this.fileTrees.webdavFiles.except
        );
        button && this.show("Pulling ...");

        if (inverted === false) {
          await Promise.all([
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.added,
              this.baseWebdav
            ),
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.modified,
              this.baseWebdav
            ),
            this.operations.deleteFilesLocal(
              this.fileTrees.webdavFiles.deleted
            ),
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.except,
              this.baseWebdav
            ),
          ]);
        } else {
          await Promise.all([
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.deleted,
              this.baseWebdav
            ),
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.modified,
              this.baseWebdav
            ),
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.modified,
              this.baseWebdav
            ),
            this.operations.deleteFilesLocal(this.fileTrees.localFiles.added),
            this.operations.downloadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.except,
              this.baseWebdav
            ),
          ]);
        }
        this.finished();
        button && this.show("Pulling completed - checking again");
        await this.check(true);
        this.force = "save";
        await this.saveState();
        button && this.show("Done");
      } catch (error) {
        console.error("PULL", error);
        button && this.show("PULL Error: " + error);
        // this.saveStateError(true)
        // this.prevData.error = true
        this.setError(true);
      } finally {
        this.status = "";
        this.setStatus("");
      }
    } else {
      button &&
        this.show(
          "Pulling not possible, currently working on '" + this.status + "'"
        );
      console.log("Action currently active: ", this.status);
    }
  }

  async push(button = true, inverted = false) {
    if (this.prevData.error) {
      const action = "push";
      if (this.force !== action) {
        this.setForce(action);
        this.show(
          "Error detected - please clear in control panel or force action by retriggering " +
            action
        );
        return;
      }
    }
    if (!this.status) {
      if (!(await this.test(false))) {
        button && this.show("Connection Problem detected!");
        return;
      }
      if (!this.fileTrees) {
        button && this.show("Checking files before pushing ...");
        console.log("NO FILETREES ");
        await this.check();
      }
      this.calcTotal(
        this.fileTrees.localFiles.added,
        this.fileTrees.localFiles.modified,
        this.fileTrees.localFiles.deleted,
        this.fileTrees.localFiles.except,
        this.fileTrees.webdavFiles.modified
      );
      // this.fileTrees.webdavFiles.deleted, this.fileTrees.localFiles.modified, this.fileTrees.webdavFiles.added, this.fileTrees.localFiles.except)
      this.setStatus("⬆️");

      try {
        const f = this.fileTrees;
        if (
          !inverted &&
          button &&
          emptyObj(f.localFiles.added) &&
          emptyObj(f.localFiles.deleted) &&
          emptyObj(f.localFiles.modified)
        ) {
          if (emptyObj(f.localFiles.except)) {
            button && this.show("Nothing to push");
            return;
          }
          // else {
          //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
          //     return
          // }
        }
        button && this.show("Pushing ...");

        if (inverted === false) {
          await Promise.all([
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.added,
              this.baseWebdav
            ),
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.modified,
              this.baseWebdav
            ),
            this.operations.deleteFilesWebdav(
              this.webdavClient,
              this.baseWebdav,
              this.fileTrees.localFiles.deleted
            ),
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.except,
              this.baseWebdav
            ),
          ]);
        } else {
          await Promise.all([
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.deleted,
              this.baseWebdav
            ),
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.modified,
              this.baseWebdav
            ),
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.webdavFiles.modified,
              this.baseWebdav
            ),
            this.operations.deleteFilesWebdav(
              this.webdavClient,
              this.baseWebdav,
              this.fileTrees.webdavFiles.added
            ),
            this.operations.uploadFiles(
              this.webdavClient,
              this.fileTrees.localFiles.except,
              this.baseWebdav
            ),
          ]);
        }

        this.finished();
        button && this.show("Pushing completed - saving current state ...");
        await this.check(true);
        this.force = "save";
        await this.saveState();
        button && this.show("Done");
      } catch (error) {
        // button && this.show("PUSH Error: " + error)
        console.error("push error", error);
        this.show("PUSH Error: " + error);
      } finally {
        this.setStatus("");
      }
    } else {
      button &&
        this.show(
          "Pushing not possible, currently working on '" + this.status + "'"
        );
      console.log("Action currently active: ", this.status);
    }
  }

  async fullSync(button = true, check = true) {
    if (this.prevData.error) {
      const action = "fullSync";
      if (this.force !== action) {
        this.setForce(action);
        this.show(
          "Error detected - please clear in control panel or force action by retriggering " +
            action
        );
        return;
      }
    }

    // console.log("FULLL")
    if (!this.status) {
      if (!(await this.test(false))) {
        this.show("Connection Problem detected!");
        return;
      }

      this.setStatus("⏳");
      try {
        if (!this.prevData.error) {
          if (
            this.prevData &&
            this.prevData.files &&
            Object.keys(this.prevData.files).length > 0
          ) {
            const lastChecked = Date.now() - this.checkTime;

            if (check || lastChecked > 1 * 60 * 1000) {
              await this.check(false);
            }

            if (this.fileTreesEmpty(button)) {
              return;
            }

            this.calcTotal(
              this.fileTrees.localFiles.added,
              this.fileTrees.localFiles.modified,
              this.fileTrees.localFiles.deleted,
              this.fileTrees.webdavFiles.deleted,
              this.fileTrees.localFiles.modified,
              this.fileTrees.webdavFiles.added
            );

            button && this.show("Synchronizing ...");

            let noError = true;
            // await Promise.all([this.pull(false), this.push(false)]) // !!! not usable with this.status set !!!
            try {
              this.setStatus("⬇️");
              // await this.pull(false)
              await Promise.all([
                this.operations.downloadFiles(
                  this.webdavClient,
                  this.fileTrees.webdavFiles.added,
                  this.baseWebdav
                ),
                this.operations.downloadFiles(
                  this.webdavClient,
                  this.fileTrees.webdavFiles.modified,
                  this.baseWebdav
                ),
                this.operations.deleteFilesLocal(
                  this.fileTrees.webdavFiles.deleted
                ),
                // downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except, this.baseLocal, this.baseWebdav)
              ]);
            } catch (error) {
              console.log("fullSync Download", error);
              noError = false;
              return error;
            }

            try {
              this.setStatus("⬆️");
              // await this.push(false);
              await Promise.all([
                this.operations.uploadFiles(
                  this.webdavClient,
                  this.fileTrees.localFiles.added,
                  this.baseWebdav
                ),
                this.operations.uploadFiles(
                  this.webdavClient,
                  this.fileTrees.localFiles.modified,
                  this.baseWebdav
                ),
                this.operations.deleteFilesWebdav(
                  this.webdavClient,
                  this.baseWebdav,
                  this.fileTrees.localFiles.deleted
                ),
                // uploadFiles(this.webdavClient, this.fileTrees.localFiles.except, this.baseLocal, this.baseWebdav),
              ]);
            } catch (error) {
              console.log("fullSync Upload", error);
              noError = false;
              return error;
            }

            // await this.check(false)
            this.finished();
            if (noError) {
              // this.prevData.error = false;
              this.setError(false);
              this.force = "save";
              await this.saveState();
            }
          } else {
            console.log(
              "No previous Data found - please perform actions manually:\nPULL - PUSH"
            );
            button &&
              this.show(
                "No previous Data found - please perform actions manually: PULL or PUSH - if this is a new install use PUSH"
              );
          }
        } else {
          console.log(
            "Previous error detected, please handle manually:\nBest is to Force PULL/PUSH depending on your current file sync requirements"
          );
          button &&
            this.show(
              "Previous error detected, please handle manually:\nBest is to Force PULL/PUSH depending on your current file sync requirements"
            );
        }

        // Continue with the rest of your code after both functions have completed
      } catch (error) {
        // Handle errors if necessary
        console.error("fullSync Error:", error, this.prevData);
        // console.log("fullSync Error:",this.prevData)
        // this.saveStateError(true)
        // this.prevData.error = true
        this.setError(true);
        this.show("Sync Error: " + error);
      } finally {
        this.setStatus("");
        this.lastSync = Date.now();
      }
    } else {
      button &&
        this.show(
          "Synchronizing not possible, currently working on '" +
            this.status +
            "'"
        );
      console.log("Action currently active: ", this.status);
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
        button &&
          this.show("Please open control panel to solve your file exceptions");
        return true;
      }
    }
    return false;
  }

  async setError(error: boolean) {
    this.prevData.error = error;
    if (error) {
      this.setStatus("");
    }
    // this.setStatus("")
    this.app.vault.adapter.write(
      this.prevPath,
      JSON.stringify(this.prevData, null, 2)
    );
  }

  // default true in order for except to be updated
  async saveState(check = false) {
    console.log("save state");
    const action = "save";
    if (this.prevData.error) {
      if (this.force !== action) {
        this.setForce(action);
        this.show(
          "Error detected - please clear in control panel or force action by retriggering " +
            action
        );
        return;
      }
    }
    if (!this.status || this.force === action) {
      this.setStatus("💾");
      try {
        // let files

        // if (check){
        //     const webdavPromise = this.checksum.generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions);
        //     const localPromise = this.checksum.generateLocalHashTree();

        //     // Use Promise.all to execute both promises simultaneously
        //     const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);
        //     const comparedFileTrees = await this.compare.compareFileTrees(webdavFiles, localFiles, this.prevData, this.settings.exclusions)
        //     this.fileTrees = comparedFileTrees;
        //     this.prevData.files = localFiles;
        //     console.log(localFiles)
        // } else {
        this.prevData.files = await this.checksum.generatePrevHashTree();
        // }

        console.log("SwagggG", this.prevData.files);
        this.prevData = {
          date: Date.now(),
          error: this.prevData.error,
          files: this.prevData.files,
          except: this.fileTrees.localFiles.except,
        };
        console.log("SwaggeeegG", this.prevData.files);
        await this.app.vault.adapter.write(
          this.prevPath,
          JSON.stringify(this.prevData, null, 2)
        );
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
        this.setStatus("");
      }
    } else {
      console.log("Action currently active: ", this.status);
    }
  }

  async savePrevData() {
    try {
      await this.app.vault.adapter.write(
        this.prevPath,
        JSON.stringify(this.prevData, null, 2)
      );
      console.log("saving prevData successful!");
      // this.prevDataSaveTimeoutId = null;
    } catch (error) {
      console.error("prevData   ", error);
    }
  }

  async initRemote() {
    //
    await this.operations.deleteFilesWebdav(
      this.webdavClient,
      this.baseWebdav,
      this.webdavFiles
    );
    await this.operations.uploadFiles(
      this.webdavClient,
      this.localFiles,
      this.baseWebdav
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calcTotal(...rest: Record<string, any>[]) {
    console.log("REST: ", rest);
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

  async setStatus(status: string, text?: string) {
    this.status = status;

    if (this.connectionError) {
      this.statusBar.setText("📴");
      this.statusBar.style.color = "red";
      return;
    }
    if (status === "") {
      if (this.prevData.error) {
        this.statusBar.setText("❌");
        this.statusBar.style.color = "red";
        return;
      } else {
        this.statusBar.setText("✔️");
        this.statusBar.style.color = "var(--status-bar-text-color)";
        return;
      }
    } else {
      this.statusBar.setText(status);
      this.statusBar.style.color = "var(--status-bar-text-color)";
    }
  }

  async processed() {
    this.loadingProcessed++;
    console.log(this.loadingProcessed.toString() + "/" + this.loadingTotal);
    this.statusBar2.setText(
      this.loadingProcessed.toString() + "/" + this.loadingTotal
    );
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
      this.status = "pause";
      this.setStatus("⏸️");
    } else {
      this.status = "";
      this.setStatus("");
    }
  }

  async displayModal() {
    // if (!this.fileTrees){
    //     await this.check()
    // }

    // console.log(this.fileTrees)
    new FileTreeModal(this.app, this).open();
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
