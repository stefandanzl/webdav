
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileSystemAdapter, TFile, TAbstractFile , Notice, Plugin,// App, Editor, MarkdownView, Modal, PluginSettingTab, Setting
 } from 'obsidian';

// import { readdirSync } from 'fs';
import { WebDAVClient } from 'webdav';
import { CloudrSettings, DEFAULT_SETTINGS, CloudrSettingsTab, FileTreeModal } from "./settings"
import { Checksum, //generateLocalHashTree, generateWebdavHashTree 
} from './checksum';
import {  Compare } from './compare';
import { Operations,
    //downloadFiles, uploadFiles, deleteFilesLocal, deleteFilesWebdav, join, configWebdav, emptyObj
} from './operations';
// import { createHash } from 'crypto';
import { join, emptyObj, sha1 } from './util';
// import * as CryptoJS from "crypto-js"
// import { sha1 } from './sha1-wrapper';
// import {sha1} from "js-sha1";
// import * as sha1 from "sha1"



export default class Cloudr extends Plugin {
    settings: CloudrSettings;
    compare: Compare;
    checksum: Checksum;
    operations: Operations;

    statusBar: HTMLElement;
    webdavPath: string;
    showModal: boolean;
    excluded: object;
    webdavClient: WebDAVClient;
    fileTrees: {
        webdavFiles: { added: object, deleted: object, modified: object, except: object },
        localFiles: { added: object, deleted: object, modified: object, except: object },
    };
    vaultName: string;
    baseLocal: string;
    baseWebdav: string;
    prevPath: string;
    prevData: {
        date?: number,
        error: boolean,
        files: object,
        except?: object,
    };
    intervalId: number;
    status: string;
    message: string;
    lastSync: number;
    notice: Notice;
    pause: boolean;
    force: string;




    async onload() {
        await this.loadSettings();

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new CloudrSettingsTab(this.app, this));

        this.compare = new Compare(this)
        this.checksum = new Checksum(this)
        this.operations = new Operations(this)
        

        // const adapter = this.app.vault.adapter;
        // if (adapter instanceof FileSystemAdapter) {
        //     this.baseLocal = adapter.getBasePath().replace(/\\/g, '/') + "/";
        //     // console.log("Base local: ", this.baseLocal)

        // } else { console.log("ERROR Localpath") }

        this.setBaseWebdav()

        this.prevPath = `${this.app.vault.configDir}/plugins/webdav/prevdata.json`;
        // console.log(this.prevPath)

    if (this.settings.enableRibbons){
        
    this.addRibbonIcon("upload-cloud", "PUSH to Webdav", () => {
        this.push()
      });

      this.addRibbonIcon("arrow-down-up", "SYNC with Webdav", () => {
        this.fullSync()
      });

        this.addRibbonIcon("download-cloud", "PULL from Webdav", () => {
            this.pull()
          });



        }

        this.addRibbonIcon("settings-2", "Open WebDav Control Panel", () => {
            this.displayModal()
          });

        try {
            this.prevData = JSON.parse(await this.app.vault.adapter.read(this.prevPath))
            // prevData.date = new Date(prevData.date)
            // this.prevData = prevData

            console.log("PREVDATA LOADED: ",this.prevData)
        } catch {
            this.prevData = {
                error: true,
                files: {},
            }
            
            this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2))
            console.error("ERROR LOADING PREVIOUS DATA! RESET prev.json to {error: true, files: {}} ")
        }

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        
        this.statusBar = this.addStatusBarItem();
        // this.statusBar = statusBar.createEl(
        //     "div",{ text: 'WEBDAV', cls: 'status-bar-item mod-clickable' }
        // );
        this.statusBar.style.width = "30px"
        this.statusBar.style.color = "green"

        this.statusBar.classList.add("status-bar-item")
        this.statusBar.classList.add("mod-clickable")
        
        this.statusBar.setText('OFF');
        this.statusBar.addEventListener('click', () => {
            if (this.app.lastEvent && this.app.lastEvent.ctrlKey){
                console.log("TTTTTTTTTTTTTTTTT")

            } else {
                this.displayModal()
            }
            
            
        });


        this.addCommand({
            id: "display-modal",
            name: "Display modal",
            callback: async () => {
                
               this.displayModal()
            },
          });

        this.addCommand({
            id: 'push',
            name: 'Force PUSH all File changes',
            callback: async () => {
                this.push()
            }
        });

        this.addCommand({
            id: 'pull',
            name: 'Force PULL all File changes',
            callback: async () => {
                this.pull()
            }
        });


        this.addCommand({
            id: 'webdav-fullsync',
            name: 'Full Sync',
            callback: async () => {

               this.fullSync()

            }
        });

        this.addCommand({
            id: 'save-prev',
            name: 'Save State',
            callback: async () => {

                this.saveState()

            }
        });

        this.addCommand({
            id: 'reset-error',
            name: 'Reset Error state',
            callback: async () => {

                this.prevData.error= false

            }
        });

        this.addCommand({
            id: 'delete-local',
            name: 'Delete pending local files',
            callback: () => {

                this.operations.deleteFilesLocal(this.fileTrees.webdavFiles.deleted)

            }
        });

        this.addCommand({
            id: 'delete-webdav',
            name: 'Delete pending webdav files',
            callback: () => {

                this.operations.deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted)

            }
        });

                this.addCommand({
                    id: 'toggle-pause-all',
                    name: 'Toggle Pause for all activities',
                    callback: () => {

                        this.togglePause()
                    }
                });
       

        this.setStatus("");
        this.setClient().then(async()=>{
        if (this.settings.pullStart && !this.prevData.error) {
            this.setStatus("🚀");
            try {
                const ok = await this.test()
            if (ok){
                await this.check()
                // this.pull()
                
               await Promise.all([
                this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added,  this.baseWebdav),
                this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified,  this.baseWebdav),
                this.operations.deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
                    // downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except, this.baseLocal, this.baseWebdav)
                ]);
                // this.saveState()
                await this.check(false)
                
            }}
            catch {
                console.error("pullstart error")
                this.show("PullStart error")
            } finally {
                this.setStatus("");
            }
        }
    });
        
        if (this.settings.liveSync){
            this.setLiveSync()
        }

        if (this.settings.autoSync){
            this.setAutoSync()
        } 
 
    }

    async setClient(){
        try{
        this.webdavClient = this.operations.configWebdav(this.settings.url, this.settings.username, this.settings.password)
        } catch (error){
            console.error("Webdav Client creation error.", error)
            this.show("Error creating Webdav Client!")
            // this.saveStateError(true)
            this.prevData
        }
    }

    async setBaseWebdav(){
        if (this.settings.overrideVault){
            this.baseWebdav = join(this.settings.webdavPath, this.settings.overrideVault).replace(/\\/g, '/')
        } else {
            this.baseWebdav = join(this.settings.webdavPath, this.app.vault.getName()).replace(/\\/g, '/')
        }
        console.log("Base webdav: ", this.baseWebdav)
    }

    async setAutoSync(){
        window.clearInterval(this.intervalId);

        if (this.settings.autoSync){
            this.intervalId = window.setInterval(() => {

                console.log('AUTOSYNC INTERVAL TRIGGERED');
                this.fullSync(false)
            }, this.settings.autoSyncInterval*1000);
    }
}

async liveSyncCallback(abstractFile: TAbstractFile){
    console.log("liveSync outer")
    if (!this.status && abstractFile instanceof TFile){
    this.status = "livesync"
    
        console.log("liveSync Inner")
        try {
            const file: TFile = abstractFile;

            const filePath: string = file.path

            if(
                (this.fileTrees && this.fileTrees.localFiles && this.fileTrees.localFiles.except && this.fileTrees.localFiles.except.hasOwnProperty(filePath)) || 
            (this.prevData.except && this.prevData.except.hasOwnProperty(filePath))
            ){ 
                console.log("File is an exception!")
                this.show("File "+filePath+" is an exception file!")
                return 
            } 
            this.setStatus("🔄")
            
            console.log(filePath)
            const data = await this.app.vault.read(file)
            // const hash = createHash('sha1').update(data).digest('hex');
            // const hash = CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
            // const hash = sha1.update(data).hex();
            const hash = sha1(data)


            const remoteFilePath = join(this.baseWebdav, filePath);
            await this.webdavClient.putFileContents(remoteFilePath, data);

            // @ts-ignore
            this.prevData.files[filePath] = hash;
            // await sleep(1000)

        }
        catch (error) {
            console.error("LiveSync Error: ",error)
            this.show("LiveSync Error")
        } finally {
            
        this.status = ""
        this.setStatus("")
        }
    }
}

setLiveSync(){
    if (this.settings.liveSync){
        this.registerEvent(this.app.vault.on("modify",(file)=>{this.liveSyncCallback(file)}))
    } else {
        this.app.vault.off("modify",(file)=>{this.liveSyncCallback(file)})
        
    }
}

    async errorWrite() {
        this.prevData.error = true;
        app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2))
    }

    async test(button = true) {
        try {
            this.setStatus("🧪");
    
            const directoryContents = await this.webdavClient.getDirectoryContents(this.settings.webdavPath);
    
            // Filter out only directories
            // @ts-ignore
            const directories = directoryContents.filter(item => item.type === "directory");
    
            // Print the list of directories
            // @ts-ignore
            const directoryList = directories.map(dir => dir.filename).join("\n");
            console.log(`Directories at /${this.settings.webdavPath}:\n${directoryList}`);
    
            if (button) {
                this.show(`Directories at /${this.settings.webdavPath}:\n${directoryList}`);
            }
    
            // If successful, log the results
            console.log("WebDAV connection test successful. Directory contents:", JSON.stringify(directoryContents, null, 2));
            this.prevData.error = false;
            return true;
        } catch (error) {
            // If an error occurs, log the error details
            console.error(`WebDAV connection test failed. Error:`, error);
            if (button) {
                this.show(`WebDAV connection test failed. Error: ${error}`);
            }
            this.prevData.error = true;
            return false;
        } finally {
            this.setStatus("");
        }
    }

    
    async check(button = true) {
        if (!button || !this.status){ //disable status check if button = false for fullsync etc.
            this.setStatus("🔎");
            
            try {
            const dir = await this.webdavClient.getDirectoryContents(this.settings.webdavPath)

            if (dir){
                this.prevData.error = false
            }
            } catch (error){
                this.show("No Connection to server! \n"+error.message)
                console.error("CHECK Connection issue: ",error)
                this.prevData.error = true
                this.setStatus("")
                return error
            }
            console.log("GAAAAAAAAAA")
        
            try {
            const webdavPromise = this.checksum.generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions);
            const localPromise = this.checksum.generateLocalHashTree(this.settings.exclusions);

            // Use Promise.all to execute both promises simultaneously
            const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);

            console.log("WEBDAV:",webdavFiles)
            console.log("LOCAL",localFiles)
            ///////// Check if valid response

            const comparedFileTrees = await this.compare.compareFileTrees(webdavFiles, localFiles, this.prevData, this.settings.exclusions)
            console.log(JSON.stringify(comparedFileTrees, null, 2))
            this.fileTrees = comparedFileTrees
 

            button && (this.fileTreesEmpty() ? null : this.show("Finished checking files"))
            return true
        } catch (error) {
            console.log("CHECK ERROR: ", error)
            button && this.show("CHECK ERROR: ", error)
            console.error("CHECK", error)
            // this.saveStateError(true)
            this.prevData.error = true
            return error
        } finally{
            this.setStatus("");
        }
    } else {
        console.log("Action currently active: ", this.status)
        button && this.show("Currently active: "+this.status)
    }
    }

    async pull(button = true, inverted= false) {
        if (this.prevData.error){ 
            const action = "pull"
            if (this.force !== action){
                this.setForce(action)
                button && this.show("Error detected - please clear in control panel or force action by retriggering "+action) 
                return
                
            }
        }
        if (!this.status){
            try{
                this.setStatus("⬇️");
                this.status = "pull"
            if (!(await this.test(false)))
            {
                this.show("Connection Problem detected!")
                return
            }
        if (!this.fileTrees) {
            button && this.show("Checking files before pulling ...");
            console.log("NO FILETREES ")
            await this.check();
            // button && this.show("");
        }
        
        const f = this.fileTrees
        if (!inverted && (button &&
            emptyObj(f.webdavFiles.added) && 
            emptyObj(f.webdavFiles.deleted) && 
            emptyObj(f.webdavFiles.modified)
        )){
            if (emptyObj(f.webdavFiles.except)){
            button && this.show("Nothing to pull")
            return }
            // else {
            //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
            //     return
            // } 
        }
        button && this.show("Pulling ...")
            
            if (inverted === false){    
            await Promise.all([
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added,  this.baseWebdav),
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified,  this.baseWebdav),
                    this.operations.deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except,  this.baseWebdav)
                ]);
            } else {
                await Promise.all([
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.localFiles.deleted,  this.baseWebdav),
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified,  this.baseWebdav),
                    this.operations.deleteFilesLocal(this.fileTrees.localFiles.added),
                    this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except,  this.baseWebdav)
                ]);
            }

                button && this.show("Pulling completed - checking again")
                this.force = "save"
                await this.saveState(false)
                button && this.show("Done")
            } catch (error){
                console.error("PULL", error)
                button && this.show("PULL Error: " + error)
                // this.saveStateError(true)
                this.prevData.error = true
            } finally{
                this.status = ""
                this.setStatus("");
                
            }
    } else {
        button && this.show("Pulling not possible, currently working on '"+this.status+"'")
        console.log("Action currently active: ", this.status)
    }
    }

    async push(button = true, inverted= false) {
        if (this.prevData.error){ 
            const action = "push"
            if (this.force !== action){
                this.setForce(action)
                this.show("Error detected - please clear in control panel or force action by retriggering "+action) 
                return
                
            }
        }
        if (!this.status ){
            if (!(await this.test(false)))
            {
                button && this.show("Connection Problem detected!")
                return
            }
        if (!this.fileTrees) {
            button && this.show("Checking files before pushing ...");
            console.log("NO FILETREES ")
            await this.check()
        }
        
        this.setStatus("⬆️");

        try{
        const f = this.fileTrees
        if (!inverted && (button && 
            emptyObj(f.localFiles.added) && 
            emptyObj(f.localFiles.deleted) && 
            emptyObj(f.localFiles.modified)
        )){
            if (emptyObj(f.localFiles.except)){
                button && this.show("Nothing to push")
                return }
                // else {
                //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
                //     return
                // } 
        }
        button && this.show("Pushing ...")
        
        if (inverted === false){
            await Promise.all([
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.added,  this.baseWebdav),
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.modified,  this.baseWebdav),
                this.operations.deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted),
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.except,  this.baseWebdav),
            ]);
        } else {
            await Promise.all([
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.webdavFiles.deleted,  this.baseWebdav),
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.modified,  this.baseWebdav),
                this.operations.deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.webdavFiles.added),
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.except,  this.baseWebdav),
            ])
        }
            
            
            button && this.show("Pushing completed - saving current state ...")
            this.force = "save"
            await this.saveState(false)
            button && this.show("Done")
        } catch (error){
            // button && this.show("PUSH Error: " + error)
            console.error("push error",error)
            this.show("PUSH Error: "+error)
        } finally {
            this.setStatus("");
        }


    } else {
        button && this.show("Pushing not possible, currently working on '"+this.status+"'")
        console.log("Action currently active: ", this.status)
    }
    }

    async fullSync(button = true){
        if (this.prevData.error){ 
            const action = "fullSync"
            if (this.force !== action){
                this.setForce(action)
                this.show("Error detected - please clear in control panel or force action by retriggering "+action) 
                return
                
            }
        }
        
        // console.log("FULLL")
        if (!this.status){
            if (!(await this.test(false)))
            {
                this.show("Connection Problem detected!")
                return
            }
            
            this.setStatus("↕️");
        try {
            if (!this.prevData.error){
            if (this.prevData && this.prevData.files && Object.keys(this.prevData.files).length > 0){
            await this.check(false)

            
            
            if(this.fileTreesEmpty(button)){ return }
            button && this.show("Synchronizing ...")

            let noError = true;
            // await Promise.all([this.pull(false), this.push(false)]) // !!! not usable with this.status set !!!
                try {
            // await this.pull(false)
            await Promise.all([
                this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added,  this.baseWebdav),
                this.operations.downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified,  this.baseWebdav),
                this.operations.deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
                // downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except, this.baseLocal, this.baseWebdav)
            ]);
        } catch(error){
                console.log("fullSync Download",error)
                noError = false
                return error
            }

            try{
            // await this.push(false);
            await Promise.all([
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.added,  this.baseWebdav),
                this.operations.uploadFiles(this.webdavClient, this.fileTrees.localFiles.modified,  this.baseWebdav),
                this.operations.deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted),
                // uploadFiles(this.webdavClient, this.fileTrees.localFiles.except, this.baseLocal, this.baseWebdav),
            ])
        } catch(error){
            console.log("fullSync Upload",error)
            noError = false
            return error
        }

            // await this.check(false)

        if (noError){ 
            this.prevData.error = false;
            this.force = "save"
            await this.saveState()
           }
            } else {
                console.log("No previous Data found - please perform actions manually:\nPULL - PUSH")
                button && this.show("No previous Data found - please perform actions manually: PULL or PUSH - if this is a new install use PUSH")
            }
        } else{
            console.log("Previous error detected, please handle manually:\nBest is to Force PULL/PUSH depending on your current file sync requirements")
            button && this.show("Previous error detected, please handle manually:\nBest is to Force PULL/PUSH depending on your current file sync requirements")
        }

            // Continue with the rest of your code after both functions have completed
        } catch (error) {
            // Handle errors if necessary
            console.error('fullSync Error:', error, this.prevData);
            // console.log("fullSync Error:",this.prevData)
            // this.saveStateError(true)
            this.prevData.error = true
            this.show("Sync Error: "+error)
        } finally {
            this.setStatus("");
            this.lastSync = Date.now()
        }
    } else {
        button && this.show("Synchronizing not possible, currently working on '"+this.status+"'")
        console.log("Action currently active: ", this.status)
    }
    }

    fileTreesEmpty(button=true){
        const f = this.fileTrees

        if (emptyObj(f )){return true}



        if ( 
            (
                emptyObj(f.localFiles.added) && 
                emptyObj(f.localFiles.deleted) && 
                emptyObj(f.localFiles.modified)
            ) &&
            (
                emptyObj(f.webdavFiles.added) && 
                emptyObj(f.webdavFiles.deleted) && 
                emptyObj(f.webdavFiles.modified)
                ) ){

                    if (emptyObj(f.webdavFiles.except) && emptyObj(f.localFiles.except)){
                        button && this.show("Nothing to sync")
                        return true
                    } else {
                        button && this.show("Please open control panel to solve your file exceptions")
                        return true
                    }
        }
        return false
    }

    async saveStateError(error: boolean){
        this.prevData.error = error
        this.setStatus("")
        app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2))
    }

    // default true in order for except to be updated
    async saveState(check= true) {
        console.log("save state")
        if (this.prevData.error ){
            const action = "save"
            if (this.force !== action){
                this.setForce(action)
                this.show("Error detected - please clear in control panel or force action by retriggering "+action) 
                return
                
            }
        }
        if (!this.status){
            this.setStatus("💾");
            try {
                // let files
                
            if (check){
                const webdavPromise = this.checksum.generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions);
                const localPromise = this.checksum.generateLocalHashTree(this.settings.exclusions);

                // Use Promise.all to execute both promises simultaneously
                const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);
                const comparedFileTrees = await this.compare.compareFileTrees(webdavFiles, localFiles, this.prevData, this.settings.exclusions)
                this.fileTrees = comparedFileTrees;
                this.prevData.files = localFiles;
                console.log(localFiles)
            } else {
                this.prevData.files = await this.checksum.generateLocalHashTree(this.settings.exclusions);
            }

            console.log("SwagggG",this.prevData.files)
                this.prevData =
                {
                    date: Date.now(),
                    error: this.prevData.error,
                    files: this.prevData.files,
                    except: this.fileTrees.localFiles.except,
                }
                console.log("SwaggeeegG",this.prevData.files)
                this.app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2))
                console.log("saving successful!")
            } catch (error) {
                
                console.log("Error occurred while saving State. ", error)
                console.error("SAVESTATE", error)
                // this.saveStateError(true)
                this.prevData.error  = true
                return error
                
            } finally {
                this.setStatus("");
            }
        } else {
            console.log("Action currently active: ", this.status)
        }
    }

    async setStatus(status: string){
        this.status = status;
        if (status === ""){
            if (this.prevData.error){
                this.statusBar.setText("❌");
                this.statusBar.style.color = "red"
            } else {
                this.statusBar.setText("✔️");
                this.statusBar.style.color = "var(--status-bar-text-color)"
            }
        } else {
        this.statusBar.setText(status);
        this.statusBar.style.color = "var(--status-bar-text-color)"
    }
}

async setForce(action: string){
    
    this.force = action;
    // await sleep(5000)
    // this.force = ""
}

togglePause(){
    this.pause = !this.pause

    console.log(this.status)
    if (this.pause){
        this.status = "pause"
        this.setStatus("⏸️")
    } else {
        this.status = ""
        this.setStatus("")
    }
}

async displayModal(){
    // if (!this.fileTrees){
    //     await this.check()
    // }
    
    // console.log(this.fileTrees)
  new FileTreeModal(this.app, this).open();
}

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
show(message: string = "Alert!", duration?: number){
    if (this.notice){
        this.notice.hide()
    }
    
const fragment = document.createDocumentFragment();
const divElement = document.createElement("div");
divElement.textContent = message;
// divElement.setAttribute("style", "white-space: pre-wrap;");
divElement.style.whiteSpace = "pre-wrap"

fragment.appendChild(divElement);
    this.notice = new Notice(fragment, duration)
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

