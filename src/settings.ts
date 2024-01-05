// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { App,PluginSettingTab, Setting,  Modal,// Editor, MarkdownView, Notice, Plugin, FileSystemAdapter 
} from 'obsidian';
import Cloudr from "./main"


export interface CloudrSettings {
    url: string,
    username: string,
    password: string,
    webdavPath: string,
    overrideVault: string, 
    exclusions: {
        directories: string[], 
        extensions: string[], 
        markers: string[]
    },

    pullStart: boolean,
    liveSync: boolean,
    autoSync: boolean,
    autoSyncInterval: number,
    enableRibbons: boolean,

}

export const DEFAULT_SETTINGS: Partial<CloudrSettings> = {
    url: "",
    username: "",
    password: "",
    webdavPath: "",
    overrideVault: "",
    exclusions: { 
        directories: ["node_modules", ".git"], 
        extensions: [], 
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
                    this.plugin.setClient()
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
                    this.plugin.setClient()
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
                    this.plugin.setClient()
                })
            );

        new Setting(containerEl)
            .setName("Test Connection")
            .setDesc("Click Button to test Server's connection")
            .addButton((button) =>
                button
                .onClick(()=>{ this.plugin.test().then(()=>{
                    button.setButtonText(this.plugin.prevData.error ? "FAIL" : "OK");
                    if( this.plugin.message){
                        // nothing yet
                    }
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
                    // this.plugin.settings.overrideVault = value.replace(/\\/g, '/');
                    await this.plugin.saveSettings();
                    await this.plugin.setBaseWebdav();
                    this.plugin.test()
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

    titleEl.setText("FileTree Inspector")


    const buttonDivTop = contentEl.createEl("div");
    buttonDivTop.style.display = "flex"
    buttonDivTop.style.flexDirection = "row" ;
    buttonDivTop.style.justifyContent = "space-between"

    const checkButton = buttonDivTop.createEl(
        "button",{ text: 'CHECK', cls: 'mod-cta' }
    );
    checkButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        this.plugin.show("Checking files ...")
        this.plugin.check().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const resetButton = buttonDivTop.createEl(
        "button",{ text: 'RESET', cls: 'mod-cta', title: "Reset the error status in your previous data storage", attr: {
            backgroundColor: "red",
            
        } }
    );
    resetButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        this.plugin.show("Resetting Error status")
        this.plugin.saveStateError(false)
    });

    const saveButton = buttonDivTop.createEl(
        "button",{ text: 'SAVE', cls: 'mod-cta' }
    );
    saveButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        this.plugin.show("Saving current vault file state for future synchronisation actions")
        this.plugin.saveState()
    });

    const fileTreeDiv = contentEl.createEl("div");
    if (this.plugin.fileTrees){  
    fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 4));
    } else {
        fileTreeDiv.setText("Press CHECK button for data to be shown");
    }
    fileTreeDiv.style.whiteSpace = "pre"// "pre-wrap" ;
    fileTreeDiv.style.minHeight = "200px"
    fileTreeDiv.style.overflowX = "auto"
    fileTreeDiv.style.overflowY = "auto"


      const buttonDiv = contentEl.createEl("div");
      
      buttonDiv.style.display = "flex"
      buttonDiv.style.flexDirection = "row" ;
      buttonDiv.style.justifyContent = "space-between"
      
    const pullButton = buttonDiv.createEl(
        "button",{ text: 'PULL', cls: 'mod-cta' }
    );
    pullButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        // this.plugin.show("Pulling files from server ...")
        this.plugin.pull().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const syncButton = buttonDiv.createEl(
        "button",{ text: 'SYNC', cls: 'mod-cta' }
    );
    syncButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        // this.plugin.show("Synchronizing files with server ...")
        this.plugin.fullSync().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });

    const pushButton = buttonDiv.createEl(
        "button",{ text: 'PUSH', cls: 'mod-cta' }
    );
    pushButton.addEventListener('click', () => {
        // Your function logic here
        // console.log('Button clicked!');
        // this.plugin.show("Pushing files to server ...")
        this.plugin.push().then(()=>{
            fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2))
        })
    });



    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }