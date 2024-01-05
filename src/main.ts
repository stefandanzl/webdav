
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileSystemAdapter, TFile, TAbstractFile , Notice, Plugin,// App, Editor, MarkdownView, Modal, PluginSettingTab, Setting
 } from 'obsidian';
import { configWebdav, emptyObj } from './operations';
// import { readdirSync } from 'fs';
import { WebDAVClient } from 'webdav';
import { CloudrSettings, DEFAULT_SETTINGS, CloudrSettingsTab, FileTreeModal } from "./settings"
import { generateLocalHashTree, generateWebdavHashTree } from './checksum';
import { compareFileTrees } from './compare';
import { downloadFiles, uploadFiles, deleteFilesLocal, deleteFilesWebdav, join, } from './operations';
import { createHash } from 'crypto';



export default class Cloudr extends Plugin {
    settings: CloudrSettings;
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
        date?: Date,
        error: boolean,
        files: object,
        except?: object,
    };
    intervalId: number;
    status: string;
    message: string;
    lastSync: number;
    notice: Notice;



    async onload() {
        await this.loadSettings();

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new CloudrSettingsTab(this.app, this));

        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            this.baseLocal = adapter.getBasePath().replace(/\\/g, '/') + "/";
            // console.log("Base local: ", this.baseLocal)

        } else { console.log("ERROR Localpath") }

        this.setBaseWebdav()

        this.prevPath = `${this.app.vault.configDir}/plugins/obsidian-cloudr/prevdata.json`;
        // console.log(this.prevPath)

    if (this.settings.enableRibbons){
        
    this.addRibbonIcon("upload-cloud", "PUSH to Webdav", () => {
        this.push().then(()=>this.saveState)
        // console.log("Hello, you!");
      });

      this.addRibbonIcon("arrow-down-up", "SYNC with Webdav", () => {
        this.fullSync()
        // console.log("Hello, you!");
      });

        this.addRibbonIcon("download-cloud", "PULL from Webdav", () => {
            this.pull().then(()=>this.saveState)
            // console.log("Hello, you!");
          });

          this.addRibbonIcon("settings-2", "Open WebDav Control Panel", () => {
            this.displayModal()
            // console.log("Hello, you!");
          });

        }



        try {
            this.prevData = JSON.parse(await app.vault.adapter.read(this.prevPath))
            // prevData.date = new Date(prevData.date)
            // this.prevData = prevData

            console.log(this.prevData)
        } catch {
            this.prevData = {
                error: true,
                files: {},
            }
            
            app.vault.adapter.write(this.prevPath, JSON.stringify(this.prevData, null, 2))
            console.error("ERROR LOADING PREVIOUS DATA! RESET prev.json to {} ")
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
            // Your function logic here
            // console.log('Button clicked!');
            this.displayModal()
        });
        // this.statusBar.classList.add()

        // this.setClient()


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

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'generate-local-hashtree',
            name: 'Generate local Hashtree',
            callback: () => {

                generateLocalHashTree(this.baseLocal, this.settings.exclusions)
            }
        });

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'generate-webdav-hashtree',
            name: 'Generate Webdav Hashtree',
            callback: () => {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                // const self = this
                generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions)
            }
        });

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'check-local-webdav-hashtree',
            name: 'Check Local and Webdav Hashtree',
            callback: async () => {

                this.check()

            }
        });

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'sync-local-webdav-hashtree',
            name: 'Sync Local and Webdav Hashtree',
            callback: async () => {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                // const self = this
               this.fullSync()

            }
        });

        this.addCommand({
            id: 'save-prev',
            name: 'Save State',
            callback: async () => {
                //const fileTree = generateLocalHashTree(this.baseLocal, this.settings.exclusions)
                this.saveState()

            }
        });

        this.addCommand({
            id: 'reset-error',
            name: 'Reset Error state',
            callback: async () => {
                //const fileTree = generateLocalHashTree(this.baseLocal, this.settings.exclusions)
                this.saveStateError(false)

            }
        });


        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'delete-local',
            name: 'Delete pending local files',
            callback: () => {
                // Use the readdirSync function to list the contents of the current directory
                console.log("Triggered delete")
                deleteFilesLocal(this.fileTrees.webdavFiles.deleted)


            }
        });

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'delete-webdav',
            name: 'Delete pending webdav files',
            callback: () => {
                // Use the readdirSync function to list the contents of the current directory
                console.log("Triggered delete")
                deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted)


            }
        });

                // This adds a simple command that can be triggered anywhere
                this.addCommand({
                    id: 'sample1',
                    name: 'sample1',
                    callback: () => {


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
                    downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added, this.baseLocal, this.baseWebdav),
                    downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified, this.baseLocal, this.baseWebdav),
                    deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
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
        this.webdavClient = configWebdav(this.settings.url, this.settings.username, this.settings.password)
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
                // Your interval callback logic here
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
            const hash = createHash('sha1').update(data).digest('hex');

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

    async test(button = true){
        this.setStatus("🧪");
        try {
            // Attempt to list the contents of the configured path   //this.baseWebdav);
            const directoryContents = await this.webdavClient.getDirectoryContents(this.settings.webdavPath).then(contents => {
                // Filter out only directories
                // @ts-ignore
                const directories = contents.filter(item => item.type === "directory");
            
                // Print the list of directories
                // @ts-ignore
                console.log("Directories at", this.settings.webdavPath, ":", directories.map(dir => dir.filename));
                // @ts-ignore
                button && this.show("Directories at "+ "/"+this.settings.webdavPath+":\n"+ directories.map(dir => dir.filename).join("\n"));
              })
              .catch(error => {
                console.error("Error:", error);
                button && this.show(`WebDAV connection test failed. Error:`+ error)
              });
            

            // If successful, log the results
            console.log(`WebDAV connection test successful. Directory contents:`, JSON.stringify(directoryContents, null, 2));
            // this.show("Connection Test successful!\nDirectories in Webdav Base directory:\n"+dirs.join("\n"))
            // this.saveStateError(false)
            this.prevData.error = false
            return true;
        } catch (error) {
            // If an error occurs, log the error details
            console.error(`WebDAV connection test failed. Error:`+ error);
            this.show(`WebDAV connection test failed. Error:`+ error)
            // this.saveStateError(true)
            this.prevData.error = true
            return false;
        } finally {
            this.setStatus("");
        }
        
    }

    async check(button = true) {
        if (!button || !this.status){ //disable status check if button = false for fullsync etc.
            this.setStatus("🔎");
        try {
            const webdavPromise = generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions);
            const localPromise = generateLocalHashTree(this.baseLocal, this.settings.exclusions);

            // Use Promise.all to execute both promises simultaneously
            const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);

            const comparedFileTrees = await compareFileTrees(webdavFiles, localFiles, this.prevData, this.settings.exclusions)
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
            return false
        } finally{
            this.setStatus("");
        }
    } else {
        console.log("Action currently active: ", this.status)
    }
    }

    async pull(button = true) {
        if (!this.status){
        if (!this.fileTrees) {
            button && this.show("Checking files before pulling ...");
            console.log("NO FILETREES ")
            await this.check();
            // button && this.show("");
        }
        
        this.setStatus("⬇️");

        try{
        const f = this.fileTrees
        if (button &&
            emptyObj(f.webdavFiles.added) && 
            emptyObj(f.webdavFiles.deleted) && 
            emptyObj(f.webdavFiles.modified)
        ){
            if (emptyObj(f.webdavFiles.except)){
            button && this.show("Nothing to pull")
            return }
            // else {
            //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
            //     return
            // } 
        }
        button && this.show("Pulling ...")
            
                await Promise.all([
                    downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added, this.baseLocal, this.baseWebdav),
                    downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified, this.baseLocal, this.baseWebdav),
                    deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
                    downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except, this.baseLocal, this.baseWebdav)
                ]);

                button && this.show("Pulling completed - checking again")
                await this.check(false)
                button && this.show("Done")
            } catch (error){
                console.error("PULL", error)
                button && this.show("PULL Error: " + error)
                // this.saveStateError(true)
                this.prevData.error = true
            } finally{
                this.setStatus("");
                
            }
    } else {
        button && this.show("Pulling not possible, currently working on '"+this.status+"'")
        console.log("Action currently active: ", this.status)
    }
    }

    async push(button = true) {
        if (!this.status){
        if (!this.fileTrees) {
            button && this.show("Checking files before pushing ...");
            console.log("NO FILETREES ")
            await this.check()
        }
        
        this.setStatus("⬆️");

        try{
        const f = this.fileTrees
        if (button &&
            emptyObj(f.webdavFiles.added) && 
            emptyObj(f.webdavFiles.deleted) && 
            emptyObj(f.webdavFiles.modified)
        ){
            if (emptyObj(f.webdavFiles.except)){
                button && this.show("Nothing to push")
                return }
                // else {
                //     button && this.show("Please open control panel to solve your file exceptions then double click either PUSH or PULL to override and force an action for all exceptions")
                //     return
                // } 
        }
        button && this.show("Pushing ...")
        
        
            await Promise.all([
                uploadFiles(this.webdavClient, this.fileTrees.localFiles.added, this.baseLocal, this.baseWebdav),
                uploadFiles(this.webdavClient, this.fileTrees.localFiles.modified, this.baseLocal, this.baseWebdav),
                deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted),
                uploadFiles(this.webdavClient, this.fileTrees.localFiles.except, this.baseLocal, this.baseWebdav),
            ])
            button && this.show("Pushing completed - checking again")
            await this.check(false)
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
        // console.log("FULLL")
        if (!this.status){
            
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
                downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.added, this.baseLocal, this.baseWebdav),
                downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.modified, this.baseLocal, this.baseWebdav),
                deleteFilesLocal(this.fileTrees.webdavFiles.deleted),
                // downloadFiles(this.webdavClient, this.fileTrees.webdavFiles.except, this.baseLocal, this.baseWebdav)
            ]);
        } catch(error){
                console.log("fullSync Download",error)
                noError = false
            }

            try{
            // await this.push(false);
            await Promise.all([
                uploadFiles(this.webdavClient, this.fileTrees.localFiles.added, this.baseLocal, this.baseWebdav),
                uploadFiles(this.webdavClient, this.fileTrees.localFiles.modified, this.baseLocal, this.baseWebdav),
                deleteFilesWebdav(this.webdavClient, this.baseWebdav, this.fileTrees.localFiles.deleted),
                // uploadFiles(this.webdavClient, this.fileTrees.localFiles.except, this.baseLocal, this.baseWebdav),
            ])
        } catch(error){
            console.log("fullSync Upload",error)
            noError = false
        }

            await this.check(false)

            this.prevData.error = false;
            noError && await this.saveState()
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

    async saveState(check= true) {
        console.log("save state")
        if (!this.status){
            this.setStatus("💾");
        try {
            let files
            if (check){
            const webdavPromise = generateWebdavHashTree(this.webdavClient, this.baseWebdav, this.settings.exclusions);
            const localPromise = generateLocalHashTree(this.baseLocal, this.settings.exclusions);

            // Use Promise.all to execute both promises simultaneously
            const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);
            const comparedFileTrees = await compareFileTrees(webdavFiles, localFiles, this.prevData, this.settings.exclusions)
            this.fileTrees = comparedFileTrees;
                files = localFiles
        } else {
            files = await generateLocalHashTree(this.baseLocal, this.settings.exclusions);
        }

            const currState =
            {
                date: Date.now(),
                error: this.prevData.error,
                files,
                except: this.fileTrees.localFiles.except,
            }

            app.vault.adapter.write(this.prevPath, JSON.stringify(currState, null, 2))
            console.log("saving successful!")
        } catch (error) {
            
            console.log("Error occurred while saving State. ", error)
            console.error("SAVESTATE", error)
            // this.saveStateError(true)
            this.prevData.error  = true
            
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
                this.statusBar.setText("error");
                this.statusBar.style.color = "red"
            } else {
                this.statusBar.setText("✔️");
                this.statusBar.style.color = "var(--status-bar-text-color)"
            }
        } else {
        this.statusBar.setText(status);
        this.statusBar.style.color = "blue"//"var(--status-bar-text-color)"
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

