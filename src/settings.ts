// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { App,PluginSettingTab, Setting,  Modal,// Editor, MarkdownView, Notice, Plugin, FileSystemAdapter 
} from 'obsidian';
import Cloudr from "./main"


export interface CloudrSettings {
	// mySetting: string;
    // Connection
    url: string,
    username: string,
    password: string,
    webdavPath: string,
    overrideVault: string, 
    exclusions: {directories: string[], extensions: string[], markers: string[]},
    pullStart: boolean,

    liveSync: boolean,
    autoSync: boolean,
    autoSyncInterval: number,
    modifySyncInterval: number,
    modifySync: boolean,
    enableRibbons: boolean,

}

export const DEFAULT_SETTINGS: Partial<CloudrSettings> = {
	
    url: "",
    username: "",
    password: "",
   
    webdavPath: "",
    overrideVault: "",
    exclusions: { 
        directories: ["node_modules", ".git", "webdav"], 
        extensions: [".exe"], 
        markers: ["prevdata.json"],
    },

    pullStart: false,
    liveSync: false,
    autoSync: false,
    autoSyncInterval: 10,
    enableRibbons: true,

}

export class CloudrSettingsTab extends PluginSettingTab {
    plugin: Cloudr;

    constructor(app: App, plugin: Cloudr){
        super(app, plugin);
        this.plugin = plugin;
    }
	display(): void {
		const {containerEl} = this;

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
                    await this.plugin.saveSettings();
                    // this.plugin.setClient()
                })
            );

        new Setting(containerEl)
            .setName("Webdav Username")
            .setDesc("Enter your Server's Username")
            .addText((text) =>
                text
                .setPlaceholder("admin")
                .setValue(this.plugin.settings.username)
                .onChange(async (value) => {
                    this.plugin.settings.username = value;
                    await this.plugin.saveSettings();
                    // this.plugin.setClient()
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
                    await this.plugin.saveSettings();
                    // this.plugin.setClient()
                })
            );

        new Setting(containerEl)
            .setName("Apply and Test Server Config")
            .setDesc("Click Button to test Server's connection")
            .addButton((button) =>
                button
                .onClick(()=>{ this.plugin.test().then(()=>{
                    this.plugin.setClient()
                    button.setButtonText(this.plugin.prevData.error ? "FAIL" : "OK");
                    // if( this.plugin.message){
                    //     // nothing yet
                    // }
                })
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
                    this.plugin.settings.webdavPath = value.replace(/\\/g, '/');
                    await this.plugin.saveSettings();
                    await this.plugin.setBaseWebdav();
                    this.plugin.test()
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
                    this.plugin.settings.overrideVault = value.replace(/\\/g, '/');
                    await this.plugin.saveSettings();
                    await this.plugin.setBaseWebdav();
                    // this.plugin.test()
                })
            );

        new Setting(containerEl)
            .setName("Excluded Directories")
            .setDesc("Enter single folder names in separate lines")
            .addTextArea((text) =>
                text
                .setPlaceholder("My Files\nalbum\nDocuments")
                .setValue(this.plugin.settings.exclusions.directories.join('\n'))
                .onChange(async (value) => {
                    value = value.replace(/\r/g, '').replace(/\\/g, '/');
                    this.plugin.settings.exclusions.directories = value.split('\n')
                    console.log(JSON.stringify(this.plugin.settings.exclusions))
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Excluded file extensions")
            .setDesc("Enter extensions separated with commas (,)")
            .addText((text) =>
                text
                .setPlaceholder(".json, .exe, .zip")
                .setValue(this.plugin.settings.exclusions.extensions.join(', '))
                .onChange(async (value) => {
                    value = value.replace(/ /g, "")
                    this.plugin.settings.exclusions.extensions = value.split(',')

                    await this.plugin.saveSettings();
                })
            );

            new Setting(containerEl)
            .setName("Excluded filename markers")
            .setDesc("Enter markers separated by semicolons and WITHOUT spaces")
            .addText((text) =>
                text
                .setPlaceholder("_secret_;°cache~;_archive_;folder1/folder2")
                .setValue(this.plugin.settings.exclusions.markers.join(';'))
                .onChange(async (value) => {
                    // value = value.replace(/ /g, "")
                    this.plugin.settings.exclusions.markers = value.split(';')

                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("PULL Start")
            .setDesc("Enable PULL Action on Obsidian Start")
            .addToggle((toggle) =>
                toggle
                .setValue(this.plugin.settings.pullStart)
                .onChange(async (value) => {
                    this.plugin.settings.pullStart = value;
                    await this.plugin.saveSettings();
                })
            );

            new Setting(containerEl)
            .setName("Live Sync")
            .setDesc("Enable Live Synchronization on modification")
            .addToggle((toggle) =>
                toggle
                .setValue(this.plugin.settings.liveSync)
                .onChange(async (value) => {
                    this.plugin.settings.liveSync = value;
                    this.plugin.setLiveSync()
                    await this.plugin.saveSettings();
                })
            );

        // new Setting(containerEl)
        //     .setName("Live Sync sleep time")
        //     .setDesc("Enter the desired sleep interval in seconds")
        //     .addText((text) =>
        //         text
        //         .setPlaceholder("2")
        //         .setValue(this.plugin.settings.liveSyncInterval.toString())
        //         .onChange(async (value) => {
        //             const parseVal = parseInt(value, 10);
        //             if (isNaN(parseVal)) {
        //                 console.error("Failed to parse the string as a number.");
        //                 this.plugin.show("Invalid number entered")
        //             } else {
        //                 // console.log("Successfully parsed:", parseVal);
        //                 this.plugin.settings.liveSyncInterval = parseVal

        //                     this.plugin.setLiveSync()
                        
        //                 await this.plugin.saveSettings();
        //             }
                    
                    
        //         })
        //     );



        new Setting(containerEl)
            .setName("Auto Sync")
            .setDesc("Enable automatic syncing in intervals\nThis will override Modify Sync")
            .addToggle((toggle) =>
                toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    this.plugin.setAutoSync()
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Auto Sync fixed Interval")
            .setDesc("Enter the desired interval in seconds")
            .addText((text) =>
                text
                .setPlaceholder("10")
                .setValue(this.plugin.settings.autoSyncInterval.toString())
                .onChange(async (value) => {
                    const parseVal = parseInt(value, 10);
                    if (isNaN(parseVal)) {
                        console.error("Failed to parse the string as a number.");
                        this.plugin.show("Invalid number entered")
                    } else {
                        // console.log("Successfully parsed:", parseVal);
                        this.plugin.settings.autoSyncInterval = parseVal

                            this.plugin.setAutoSync()
                        
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(containerEl)
            .setName("Enable Ribbons")
            .setDesc("Enable PULL Action on Obsidian Start - Reload App for changes to take effect")
            .addToggle((toggle) =>
                toggle
                .setValue(this.plugin.settings.enableRibbons)
                .onChange(async (value) => {
                    this.plugin.settings.enableRibbons = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}

export class FileTreeModal extends Modal {
    // plugin: Cloudr;
    // fileTrees: object;

    constructor(app: App, public plugin: Cloudr){//public fileTrees: object) {
      super(app);
    //   this.plugin = plugin;
    // this.fileTrees = fileTrees;
    }
  
    onOpen() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { titleEl, modalEl, contentEl, containerEl } = this;

    //     document.getElementsByClassName("modal").forEach(element => {
        
    // }); (const m in document.getElementsByClassName("modal")){
        
    // }
    // .item   .style.overflowY = "none"
    modalEl.style.overflowY = "hidden"
    modalEl.style.width = "100%"
    modalEl.style.height = "100%"

    titleEl.setText("Webdav Control Panel")


    const mainDiv = contentEl.createEl("div");
    mainDiv.style.display = "flex"
    mainDiv.style.flexDirection = "row" ;
    mainDiv.style.justifyContent = "space-between"
    mainDiv.style.gap = "40px"
    mainDiv.style.margin = "5px"

    const buttonDiv = mainDiv.createEl("div");
    buttonDiv.style.display = "flex"
    buttonDiv.style.flexDirection = "column" ;
    // buttonDiv.style.alignContent = "space-around"
    // buttonDiv.style.flexWrap = "wrap"
    buttonDiv.style.gap = "20px"
    buttonDiv.style.position = "fixed"
    // buttonDiv.style.top = "20px"
    // const buttonDivWidth = buttonDiv.offsetWidth
    // const buttonDivHeight = buttonDiv.offsetHeight;

    // console.log("BUTTON ",buttonDivHeight)

    // mainDiv.style.minHeight = `${buttonDivHeight}px`
    mainDiv.style.minHeight = `330px`

    const checkButton = buttonDiv.createEl(
        "button",{ text: 'CHECK', cls: 'mod-cta' }
    );
    checkButton.addEventListener('click', () => {
        // this.plugin.show("Checking files ...")
        this.plugin.check().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const pauseButton = buttonDiv.createEl(
        "button",{ text: 'PAUSE', cls: 'mod-cta' }
    );
    pauseButton.addEventListener('click', () => {
        this.plugin.show("Toggling Pause")
        this.plugin.togglePause()
    });

    const errorButton = buttonDiv.createEl(
        "button",{ text: 'ERROR', cls: 'mod-cta', title: "Clear the error status in your previous data storage", attr: {
            backgroundColor: "red",
            
        } }
    );
    errorButton.addEventListener('click', () => {
        this.plugin.show("Resetting Error status")
        this.plugin.prevData.error= false
        this.plugin.setStatus("")
        
    });

    const saveButton = buttonDiv.createEl(
        "button",{ text: 'SAVE', cls: 'mod-cta' }
    );
    saveButton.addEventListener('click', () => {
        this.plugin.show("Saving current vault file state for future synchronisation actions")
        this.plugin.saveState(true)
    });

    
    const pullButton = buttonDiv.createEl(
        "button",{ text: 'PULL', cls: 'mod-cta' }
    );
    pullButton.addEventListener('click', () => {
        // this.plugin.show("Pulling files from server ...")
        this.plugin.pull().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const syncButton = buttonDiv.createEl(
        "button",{ text: 'SYNC', cls: 'mod-cta' }
    );
    syncButton.addEventListener('click', () => {
        // this.plugin.show("Synchronizing files with server ...")
        this.plugin.fullSync().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const pushButton = buttonDiv.createEl(
        "button",{ text: 'PUSH', cls: 'mod-cta' }
    );
    pushButton.addEventListener('click', () => {
        // this.plugin.show("Pushing files to server ...")
        this.plugin.push().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });




    // Inverted buttons

    const pullInvertButton = buttonDiv.createEl(
        "button",{ text: '!PULL', cls: 'mod-cta' }
    );
    pullInvertButton.addEventListener('click', () => {
        this.plugin.show("Inverted Pulling files from server ...")
        this.plugin.pull(true,true).then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const pushInvertButton = buttonDiv.createEl(
        "button",{ text: '!PUSH', cls: 'mod-cta' }
    );
    pushInvertButton.addEventListener('click', () => {
        this.plugin.show("Inverted Pushing files to server ...")
        this.plugin.push(true,true).then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });


         // const buttonDiv = contentEl.createEl("div");
    
    // buttonDiv.style.display = "flex"
    // buttonDiv.style.flexDirection = "row" ;
    // buttonDiv.style.justifyContent = "space-between"

    const containDiv = mainDiv.createEl("div");
    containDiv.style.overflow = "auto"
    containDiv.style.height = "100%"
    

    const fileTreeDiv = containDiv.createEl("div");
    
    
    fileTreeDiv.style.whiteSpace = "pre"// "pre-wrap" ;
    fileTreeDiv.style.minHeight = "70vh"
    // fileTreeDiv.style.overflowX = "auto"
    // fileTreeDiv.style.overflowY = "auto"
    // fileTreeDiv.style.marginLeft = `${buttonDivWidth}px`;
    fileTreeDiv.style.marginLeft = `80px`;
    fileTreeDiv.style.overflow = "auto"
    fileTreeDiv.style.userSelect = "text"; /* Allow text selection */
    // fileTreeDiv.style.cursor = "text";
    fileTreeDiv.style.height = "100px"
    fileTreeDiv.style.paddingBottom = "10px"
   
    if (this.plugin.fileTrees){  
        fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 4));//.replace(/: /g, ': \t'));
        } else {
            fileTreeDiv.setText("Press CHECK button for data to be shown");
        }
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }