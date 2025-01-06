import { App, Modal } from "obsidian";
import  Cloudr  from "./main";



export class FileTreeModal extends Modal {
    // plugin: Cloudr;
    // fileTrees: object;
  
    constructor(app: App, public plugin: Cloudr) {
      //public fileTrees: object) {
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
      modalEl.style.overflowY = "hidden";
      modalEl.style.width = "100%";
      modalEl.style.height = "100%";
  
      titleEl.setText("Webdav Control Panel");
  
      const mainDiv = contentEl.createEl("div");
      mainDiv.style.display = "flex";
      mainDiv.style.flexDirection = "row";
      mainDiv.style.justifyContent = "space-between";
      mainDiv.style.gap = "40px";
      mainDiv.style.margin = "5px";
  
      const buttonDiv = mainDiv.createEl("div");
      buttonDiv.style.display = "flex";
      buttonDiv.style.flexDirection = "column";
      // buttonDiv.style.alignContent = "space-around"
      // buttonDiv.style.flexWrap = "wrap"
      buttonDiv.style.gap = "20px";
      buttonDiv.style.position = "fixed";
      // buttonDiv.style.top = "20px"
      // const buttonDivWidth = buttonDiv.offsetWidth
      // const buttonDivHeight = buttonDiv.offsetHeight;
  
      // console.log("BUTTON ",buttonDivHeight)
  
      // mainDiv.style.minHeight = `${buttonDivHeight}px`
      mainDiv.style.minHeight = `330px`;
  
      const checkButton = buttonDiv.createEl("button", {
        text: "CHECK",
        cls: "mod-cta",
      });
      checkButton.addEventListener("click", () => {
        // this.plugin.show("Checking files ...")
        this.plugin.check().then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      const pauseButton = buttonDiv.createEl("button", {
        text: "PAUSE",
        cls: "mod-cta",
      });
      pauseButton.addEventListener("click", () => {
        this.plugin.show("Toggling Pause");
        this.plugin.togglePause();
      });
  
      const errorButton = buttonDiv.createEl("button", {
        text: "ERROR",
        cls: "mod-cta",
        title: "Clear the error status in your previous data storage",
        attr: {
          backgroundColor: "red",
        },
      });
      errorButton.addEventListener("click", () => {
        this.plugin.show("Resetting Error status");
        this.plugin.prevData.error = false;
        this.plugin.setStatus("");
      });
  
      const saveButton = buttonDiv.createEl("button", {
        text: "SAVE",
        cls: "mod-cta",
      });
      saveButton.addEventListener("click", () => {
        this.plugin.show(
          "Saving current vault file state for future synchronisation actions"
        );
        this.plugin.saveState();
      });
  
      const pullButton = buttonDiv.createEl("button", {
        text: "PULL",
        cls: "mod-cta",
      });
      pullButton.addEventListener("click", () => {
        // this.plugin.show("Pulling files from server ...")
        this.plugin.pull().then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      const syncButton = buttonDiv.createEl("button", {
        text: "SYNC",
        cls: "mod-cta",
      });
      syncButton.addEventListener("click", () => {
        // this.plugin.show("Synchronizing files with server ...")
        this.plugin.fullSync(true, false).then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      const pushButton = buttonDiv.createEl("button", {
        text: "PUSH",
        cls: "mod-cta",
      });
      pushButton.addEventListener("click", () => {
        // this.plugin.show("Pushing files to server ...")
        this.plugin.push().then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      // Inverted buttons
  
      const pullInvertButton = buttonDiv.createEl("button", {
        text: "!PULL",
        cls: "mod-cta",
      });
      pullInvertButton.addEventListener("click", () => {
        this.plugin.show("Inverted Pulling files from server ...");
        this.plugin.pull(true, true).then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      const pushInvertButton = buttonDiv.createEl("button", {
        text: "!PUSH",
        cls: "mod-cta",
      });
      pushInvertButton.addEventListener("click", () => {
        this.plugin.show("Inverted Pushing files to server ...");
        this.plugin.push(true, true).then(() => {
          fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });
      });
  
      // const buttonDiv = contentEl.createEl("div");
  
      // buttonDiv.style.display = "flex"
      // buttonDiv.style.flexDirection = "row" ;
      // buttonDiv.style.justifyContent = "space-between"
  
      const containDiv = mainDiv.createEl("div");
      containDiv.style.overflow = "auto";
      containDiv.style.height = "100%";
  
      const fileTreeDiv = containDiv.createEl("div");
  
      fileTreeDiv.style.whiteSpace = "pre"; // "pre-wrap" ;
      fileTreeDiv.style.minHeight = "70vh";
      // fileTreeDiv.style.overflowX = "auto"
      // fileTreeDiv.style.overflowY = "auto"
      // fileTreeDiv.style.marginLeft = `${buttonDivWidth}px`;
      fileTreeDiv.style.marginLeft = `80px`;
      fileTreeDiv.style.overflow = "auto";
      fileTreeDiv.style.userSelect = "text"; /* Allow text selection */
      // fileTreeDiv.style.cursor = "text";
      fileTreeDiv.style.height = "100px";
      fileTreeDiv.style.paddingBottom = "10px";
  
      if (this.plugin.fileTrees) {
        fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 4)); //.replace(/: /g, ': \t'));
      } else {
        fileTreeDiv.setText("Press CHECK button for data to be shown");
      }
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }
  