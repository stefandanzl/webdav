import { App, Modal } from "obsidian";
import Cloudr from "./main";
import { Status } from "./const";

export class FileTreeModal extends Modal {
    fileTreeDiv: HTMLDivElement;
    constructor(
        app: App,
        public plugin: Cloudr
    ) {
        super(app);
    }

    onOpen() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { titleEl, modalEl, contentEl, containerEl } = this;

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

        buttonDiv.style.gap = "20px";
        buttonDiv.style.position = "fixed";

        mainDiv.style.minHeight = `330px`;

        const checkButton = buttonDiv.createEl("button", {
            text: "CHECK",
            cls: "mod-cta",
        });
        checkButton.addEventListener("click", () => {
            // this.plugin.show("Checking files ...")
            this.plugin.operations.check().then(() => {
                this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
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
            this.plugin.setStatus(Status.NONE);
        });

        const saveButton = buttonDiv.createEl("button", {
            text: "SAVE",
            cls: "mod-cta",
        });
        saveButton.addEventListener("click", () => {
            this.plugin.show("Saving current vault file state for future synchronisation actions");
            this.plugin.saveState();
        });

        const pullButton = buttonDiv.createEl("button", {
            text: "PULL",
            cls: "mod-cta",
        });
        pullButton.addEventListener("click", () => {
            // this.plugin.show("Pulling files from server ...")

            // Regular pull
            this.plugin.operations
                .sync({
                    local: {},
                    webdav: {
                        added: 1,
                        deleted: 1,
                        modified: 1,
                        except: 1,
                    },
                })
                .then(() => {
                    this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
                });
        });

        const syncButton = buttonDiv.createEl("button", {
            text: "SYNC",
            cls: "mod-cta",
        });
        syncButton.addEventListener("click", () => {
            // this.plugin.show("Synchronizing files with server ...")
            this.plugin.operations
                .sync({
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
                })
                .then(() => {
                    this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
                });
        });

        const pushButton = buttonDiv.createEl("button", {
            text: "PUSH",
            cls: "mod-cta",
        });
        pushButton.addEventListener("click", () => {
            // this.plugin.show("Pushing files to server ...")
            this.plugin.operations
                .sync({
                    local: {
                        added: 1,
                        deleted: 1,
                        modified: 1,
                        except: 1,
                    },
                    webdav: {},
                })
                .then(() => {
                    this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
                });
        });

        // Inverted buttons

        const pullInvertButton = buttonDiv.createEl("button", {
            text: "!PULL",
            cls: "mod-cta",
        });
        pullInvertButton.addEventListener("click", () => {
            this.plugin.show("Inverted Pulling files from server ...");
            this.plugin.operations
                .sync({
                    local: {},
                    webdav: {
                        added: -1,
                        deleted: -1,
                        modified: -1,
                        except: -1,
                    },
                })
                .then(() => {
                    this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
                });
        });

        const pushInvertButton = buttonDiv.createEl("button", {
            text: "!PUSH",
            cls: "mod-cta",
        });
        pushInvertButton.addEventListener("click", () => {
            this.plugin.show("Inverted Pushing files to server ...");
            this.plugin.operations
                .sync({
                    local: {
                        added: -1,
                        deleted: -1,
                        modified: -1,
                        except: -1,
                    },
                    webdav: {},
                })
                .then(() => {
                    this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
                });
        });

        const containDiv = mainDiv.createEl("div");
        containDiv.style.overflow = "auto";
        containDiv.style.height = "100%";

        this.fileTreeDiv = containDiv.createEl("div");

        this.fileTreeDiv.style.whiteSpace = "pre"; // "pre-wrap" ;
        this.fileTreeDiv.style.minHeight = "70vh";
        this.fileTreeDiv.style.marginLeft = `80px`;
        this.fileTreeDiv.style.overflow = "auto";
        this.fileTreeDiv.style.userSelect = "text"; 
        this.fileTreeDiv.style.height = "100px";
        this.fileTreeDiv.style.paddingBottom = "10px";

        if (this.plugin.fileTrees) {
            this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 4)); //.replace(/: /g, ': \t'));
        } else {
            this.fileTreeDiv.setText("Press CHECK button for data to be shown");
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
