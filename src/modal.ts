import { App, Modal } from "obsidian";
import Cloudr from "./main";
import { FileTree, FileTrees, PLUGIN_ID, Status } from "./const";

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

        modalEl.addClass("webdav-modal");
        titleEl.setText("Webdav Control Panel");

        const mainDiv = contentEl.createDiv({ cls: "webdav-container" });

        const buttonDiv = mainDiv.createDiv({ cls: "webdav-button-container" });
        // Add buttons here

        let advancedEnabled = false;

        /**
         * CHECK Button
         */
        const checkButton = buttonDiv.createEl("button", {
            text: `CHECK ${Status.CHECK}`,
            cls: ["mod-cta", "webdav-button"],
        });
        checkButton.addEventListener("click", async () => {
            // this.plugin.show("Checking files ...")
            await this.plugin.operations.check();
            // this.fileTreeDiv.(renderFileTrees(this.plugin.fileTrees))
            //setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });

        /**
         * SYNC Button
         */
        const syncButton = buttonDiv.createEl("button", {
            text: `SYNC ${Status.SYNC}`,
            cls: ["mod-cta", "webdav-button"],
        });
        syncButton.addEventListener("click", async () => {
            // this.plugin.show("Synchronizing files with server ...")
            await this.plugin.operations.sync({
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
            this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
        });

        /**
         * Webdav Settings Button
         */
        const openSettingsButton = buttonDiv.createEl("button", {
            text: "SETTINGS 🛠",
            cls: ["mod-cta", "webdav-button"],
        });
        openSettingsButton.addEventListener("click", () => {
            this.plugin.settingPrivate.openTabById(PLUGIN_ID);
            this.plugin.settingPrivate.open();
        });

        /**
         * CHECK Button
         */
        const advancedButton = buttonDiv.createEl("button", {
            text: "ADVANCED ⚡",
            cls: ["mod-cta", "webdav-button"],
        });
        advancedButton.addEventListener("click", async () => {
            if (advancedEnabled) {
                this.plugin.show("Advanced Actions Buttons already enabled.");
                return;
            }
            this.plugin.show("Warning! Use Advanced Actions carefully!");
            advancedEnabled = true;

            /**
             * PAUSE Button
             */
            const pauseButton = buttonDiv.createEl("button", {
                text: `PAUSE ${Status.PAUSE}`,
                cls: ["mod-cta", "webdav-button"],
            });
            pauseButton.addEventListener("click", () => {
                this.plugin.show("Toggling Pause");
                this.plugin.togglePause();
            });

            /**
             * ERROR Button
             */
            const errorButton = buttonDiv.createEl("button", {
                text: `ERROR ${Status.ERROR}`,
                cls: ["mod-cta", "webdav-button"],
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

            /**
             * SAVE Button
             */
            const saveButton = buttonDiv.createEl("button", {
                text: `SAVE ${Status.SAVE}`,
                cls: ["mod-cta", "webdav-button"],
            });
            saveButton.addEventListener("click", () => {
                this.plugin.show("Saving current vault file state for future synchronisation actions");
                this.plugin.saveState();
            });

            /**
             * PULL Button
             */
            const pullButton = buttonDiv.createEl("button", {
                text: `PULL ${Status.PULL}`,
                cls: ["mod-cta", "webdav-button"],
            });
            pullButton.addEventListener("click", async () => {
                await this.plugin.operations.sync({
                    local: {},
                    webdav: {
                        added: 1,
                        deleted: 1,
                        modified: 1,
                        except: 1,
                    },
                });
                this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
            });

            /**
             * PUSH Button
             */
            const pushButton = buttonDiv.createEl("button", {
                text: `PUSH ${Status.PUSH}`,
                cls: ["mod-cta", "webdav-button"],
            });
            pushButton.addEventListener("click", async () => {
                // this.plugin.show("Pushing files to server ...")
                await this.plugin.operations.sync({
                    local: {
                        added: 1,
                        deleted: 1,
                        modified: 1,
                        except: 1,
                    },
                    webdav: {},
                });
                this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
            });

            /**
             * Inverted PULL Button
             */
            const pullInvertButton = buttonDiv.createEl("button", {
                text: "!PULL",
                cls: ["mod-cta", "webdav-button"],
            });
            pullInvertButton.addEventListener("click", async () => {
                this.plugin.show("Inverted Pulling files from server ...");
                await this.plugin.operations.sync({
                    local: {},
                    webdav: {
                        added: -1,
                        deleted: -1,
                        modified: -1,
                        except: -1,
                    },
                });
                this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
            });

            /**
             * Inverted PUSH Button
             */
            const pushInvertButton = buttonDiv.createEl("button", {
                text: "!PUSH",
                cls: ["mod-cta", "webdav-button"],
            });
            pushInvertButton.addEventListener("click", async () => {
                this.plugin.show("Inverted Pushing files to server ...");
                await this.plugin.operations.sync({
                    local: {
                        added: -1,
                        deleted: -1,
                        modified: -1,
                        except: -1,
                    },
                    webdav: {},
                });
                this.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
            });
        });

        const containDiv = mainDiv.createDiv({ cls: "webdav-content" });
        this.fileTreeDiv = containDiv.createDiv({ cls: "webdav-file-tree" });

        this.plugin.operations.check();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.plugin.modal;
    }

    renderFileTrees() {
        // Clear previous content
        this.fileTreeDiv.empty();
        const mainContainer = this.fileTreeDiv.createDiv({ cls: "sync-status" });

        // Check if there's anything to sync
        const hasAnyChanges = ["webdavFiles", "localFiles"].some((location) => {
            const locationData = this.plugin.fileTrees[location as keyof FileTrees];
            return Object.values(locationData).some((section) => Object.keys(section).length > 0);
        });

        if (!hasAnyChanges) {
            const emptyMessage = mainContainer.createDiv({ cls: "sync-empty-message" });
            emptyMessage.createDiv({
                cls: "sync-empty-text",
                text: "Nothing to sync ✓",
            });
            return mainContainer;
        }

        // Helper function to render a section if it has entries
        function renderSection(parent: HTMLElement, title: string, data: Record<string, string>) {
            if (Object.keys(data).length === 0) return;

            const sectionDiv = parent.createDiv({ cls: "sync-section" });

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const titleDiv = sectionDiv.createDiv({
                cls: "sync-section-title",
                text: title,
            });

            const contentDiv = sectionDiv.createDiv({ cls: "sync-section-content" });

            Object.keys(data).forEach((path) => {
                contentDiv.createDiv({
                    cls: "sync-file-entry",
                    text: path,
                });
            });
        }

        // Render each location if it has any changes
        ["webdavFiles", "localFiles"].forEach((location) => {
            const locationData = this.plugin.fileTrees[location as keyof FileTrees];
            const hasChanges = Object.values(locationData).some((section) => Object.keys(section).length > 0);

            if (hasChanges) {
                const locationDiv = mainContainer.createDiv({ cls: "sync-location" });
                locationDiv.createDiv({
                    cls: "sync-location-title",
                    text: location === "webdavFiles" ? "Remote" : "Local",
                });

                ["added", "deleted", "modified"].forEach((type) => {
                    renderSection(locationDiv, type.charAt(0).toUpperCase() + type.slice(1), locationData[type as keyof FileTree]);
                });
            }
        });

        if (Object.keys(this.plugin.fileTrees.localFiles.except).length > 0) {
            const locationDiv = mainContainer.createDiv({ cls: "sync-location" });
            locationDiv.createDiv({
                cls: "sync-location-title",
                text: "File exceptions",
            });
            renderSection(locationDiv, "Except", this.plugin.fileTrees.localFiles.except);
        }

        // return mainContainer;
    }
}
