import { App, Modal } from "obsidian";
import Cloudr from "./main";
import { FileTree, FileTrees, Location, PLUGIN_ID, Status, Type } from "./const";

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
            });
        });

        const containDiv = mainDiv.createDiv({ cls: "webdav-content" });
        this.fileTreeDiv = containDiv.createDiv({ cls: "webdav-file-tree" });
        // Save position
        this.fileTreeDiv.addEventListener("scroll", (e) => {
            this.plugin.lastScrollPosition = (e.target as HTMLElement).scrollTop;
        });

        if (!this.plugin.fileTrees) {
            this.plugin.operations.check();
        } else {
            this.renderFileTrees();
        }
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
        function renderSection(
            plugin: Cloudr,
            parent: HTMLElement,
            title: string,
            data: Record<string, string>,
            parents?: { location?: Location; type: Type }
        ) {
            if (Object.keys(data).length === 0) return;

            const sectionDiv = parent.createDiv({ cls: "sync-section" });

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const titleDiv = sectionDiv.createDiv({
                cls: "sync-section-title",
                text: title,
            });

            const contentDiv = sectionDiv.createDiv({ cls: "sync-section-content" });

            Object.keys(data).forEach((path) => {
                const pathDiv = contentDiv.createDiv({
                    cls: "sync-file-entry",
                    text: path,
                });

                pathDiv.onClickEvent((event) => {
                    switch (event.button) {
                        // Left Click
                        case 0:
                            if (!path.endsWith("/")) {
                                plugin.app.workspace.openLinkText(path, ""); //   openFile(file: TFile, openState?: OpenViewState)
                            }
                            break;
                        // Middle Click
                        case 1:
                            console.log("Middle Click", path);
                            break;
                        // Right Click
                        case 2:
                            if (!parents) {
                                return;
                            }
                            if (parents.type === "except") {
                                // check if defined
                                if (!Object.keys(plugin.tempExcludedFiles).includes(path)) {
                                    const location: Location = "localFiles";
                                    const hash = plugin.fileTrees[location][parents.type][path];
                                    plugin.tempExcludedFiles[path] = {
                                        location,
                                        type: "except",
                                        hash,
                                    };
                                    plugin.fileTrees[location].modified[path] = hash;
                                    pathDiv.addClass("path-except-upload");
                                } else if (plugin.tempExcludedFiles[path].location === "localFiles") {
                                    const location: Location = "webdavFiles";
                                    const hash = plugin.fileTrees[location][parents.type][path];
                                    plugin.tempExcludedFiles[path] = {
                                        location,
                                        type: "except",
                                        hash,
                                    };
                                    plugin.fileTrees[location].modified[path] = hash;
                                    delete plugin.fileTrees["localFiles"].modified[path];
                                    pathDiv.removeClass("path-except-upload");
                                    pathDiv.addClass("path-except-download");
                                } else if (plugin.tempExcludedFiles[path].location === "webdavFiles") {
                                    delete plugin.tempExcludedFiles[path];
                                    
                                    delete plugin.fileTrees["webdavFiles"].modified[path];
                                    pathDiv.removeClass("path-except-download");
                                }
                                return;
                            }

                            if (Object.keys(plugin.tempExcludedFiles).includes(path)) {
                                const hash = plugin.tempExcludedFiles[path].hash;
                                delete plugin.tempExcludedFiles[path];
                                plugin.fileTrees[parents?.location as keyof FileTrees][parents?.type as keyof FileTree][path] = hash;
                                pathDiv.removeClass("path-disabled");
                            } else {
                                // is not persistent on app restart!
                                const hash = plugin.fileTrees[parents.location as keyof FileTrees][parents.type as keyof FileTree][path];
                                //@ts-ignore
                                plugin.tempExcludedFiles = {
                                    ...plugin.tempExcludedFiles,
                                    [path]: { location: parents.location, type: parents.type, hash: hash },
                                };
                                delete plugin.fileTrees[parents.location as keyof FileTrees][parents.type as keyof FileTree][path];
                                pathDiv.addClass("path-disabled");
                            }

                            // sync: check if path is in tempExcluded
                            // save: don't save the current hash for path
                            console.log(plugin.tempExcludedFiles);
                            break;
                        default:
                            break;
                    }
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
                    renderSection(
                        this.plugin,
                        locationDiv,
                        type.charAt(0).toUpperCase() + type.slice(1),
                        locationData[type as keyof FileTree],
                        //@ts-ignore
                        { location, type }
                    );
                });
            }
        });

        if (Object.keys(this.plugin.fileTrees.localFiles.except).length > 0) {
            const locationDiv = mainContainer.createDiv({ cls: "sync-location" });
            locationDiv.createDiv({
                cls: "sync-location-title",
                text: "File exceptions",
            });
            renderSection(this.plugin, locationDiv, "Except", this.plugin.fileTrees.localFiles.except, { type: "except" });
        }
        // Restore scroll position after content is rendered
        this.fileTreeDiv.scrollTop = this.plugin.lastScrollPosition;
        // return mainContainer;
    }
}
