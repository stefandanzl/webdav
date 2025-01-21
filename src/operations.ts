import Cloudr from "./main";
import { WebDAVClient } from "./webdav";
import { join, dirname } from "./util";
import {  normalizePath } from "obsidian";
import { Controller, FileList, Status } from "./const";

const WEBDAV_HEADERS = { "Cache-Control": "no-cache, no-store, must-revalidate" };

export class Operations {
    constructor(public plugin: Cloudr) {
        this.plugin = plugin;
    }

    /**
     * Configure and create WebDAV client
     */
    configWebdav(url: string, username: string, password: string): WebDAVClient {
        if (!(url && username && password)) {
            throw new Error("Missing WebDAV configuration parameters");
        }

        return new WebDAVClient(url, {
            username,
            password,
            headers: WEBDAV_HEADERS,
        });
    }

    async downloadFiles(webdavClient: WebDAVClient, filesMap: FileList, remoteBasePath: string): Promise<void> {
        if (!filesMap || Object.keys(filesMap).length === 0) {
            this.plugin.log("No files to download");
            return;
        }

        // First attempt for all files
        const results = await Promise.all(
            Object.entries(filesMap).map(async ([filePath, _]) => ({
                filePath,
                success: await this.downloadFile(webdavClient, filePath, remoteBasePath),
            }))
        );

        // Filter out failed downloads and retry them
        const failedDownloads = results.filter((r) => !r.success);
        if (failedDownloads.length > 0) {
            console.log(`Retrying ${failedDownloads.length} failed downloads...`);
            await Promise.all(failedDownloads.map(({ filePath }) => this.downloadFile(webdavClient, filePath, remoteBasePath)));
        }
    }

    private async downloadFile(webdavClient: WebDAVClient, filePath: string, remoteBasePath: string): Promise<boolean> {
        try {
            if (filePath.endsWith("/")) {
                await this.ensureLocalDirectory(filePath);
                this.plugin.processed();
                return true;
            }

            const remotePath = join(remoteBasePath, filePath);

            // Verify remote file exists
            const remoteStats = await webdavClient.exists(remotePath);
            if (!remoteStats) {
                console.error(`Remote file not found: ${remotePath}`);
                return false;
            }

            // Ensure local directory exists
            await this.ensureLocalDirectory(dirname(filePath));

            // Download with retry
            const fileData = await this.downloadWithRetry(webdavClient, remotePath);
            if (fileData.status !== 200) {
                throw new Error(`Failed to download ${remotePath}: ${fileData.status}`);
            }
            /// app.vault.adapter.writeBinary("AAA/AAA/A1.md","TEST")
            await this.plugin.app.vault.adapter.writeBinary(filePath, fileData.data);
            this.plugin.processed();
            return true;
        } catch (error) {
            this.plugin.log(`Error downloading ${filePath}:`, error);
            return false;
        }
    }

    // Helper methods
    private async downloadWithRetry(
        webdavClient: WebDAVClient,
        remotePath: string,
        maxRetries = 2
    ): Promise<{
        data: ArrayBuffer;
        status: number;
    }> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // return await webdavClient.getFileContents(remotePath, {
                //     format: "binary"
                // });
                return await webdavClient.get(remotePath);
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`Retry ${attempt} for ${remotePath}`);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        throw new Error(`Failed to download after ${maxRetries} attempts`);
    }

    private async ensureLocalDirectory(path: string): Promise<void> {
        const exists = await this.plugin.app.vault.adapter.exists(path);
        if (!exists) {
            console.log(`Creating local directory: ${path}`);
            await this.plugin.app.vault.createFolder(path);
        }
    }

    /**
     * Upload files to WebDAV server
     */
    async uploadFiles(webdavClient: WebDAVClient, fileChecksums: FileList, remoteBasePath: string): Promise<void> {
        if (!fileChecksums || Object.keys(fileChecksums).length === 0) {
            this.plugin.log("No files to upload");
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [localFilePath, _] of Object.entries(fileChecksums)) {
            await this.uploadFile(webdavClient, localFilePath, remoteBasePath);
        }

        console.log("Upload completed");
    }

    /**
     * Upload a single file to WebDAV
     */
    private async uploadFile(webdavClient: WebDAVClient, localFilePath: string, remoteBasePath: string): Promise<void> {
        try {
            if (localFilePath.endsWith("/")) {
                await this.ensureRemoteDirectory(webdavClient, localFilePath, remoteBasePath);
                return;
            }

            const fileContent = await this.plugin.app.vault.adapter.readBinary(normalizePath(localFilePath));
            const remoteFilePath = join(remoteBasePath, localFilePath);

            await webdavClient.put(remoteFilePath, fileContent);
            this.plugin.processed();
            this.plugin.log(`Uploaded: ${localFilePath} to ${remoteFilePath}`);
        } catch (error) {
            console.error(`Error uploading ${localFilePath}:`, error);
        }
    }

    /**
     * Delete files from WebDAV server
     */
    async deleteFilesWebdav(client: WebDAVClient, basePath: string, fileTree: FileList): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            this.plugin.log("No files to delete on WebDAV");
            return;
        }

        const failedPaths: string[] = [];

        const deleteFile = async (path: string): Promise<void> => {
            const cleanPath = path.endsWith("/") ? path.replace(/\/$/, "") : path;
            const fullPath = join(basePath, cleanPath);

            try {
                const response = await client.delete(fullPath);
                // console.log(response, typeof response)
                //
                if (response !== 204 && response !== 404) {
                    console.log(fullPath, " Errorstatus: ", response);
                    failedPaths.push(fullPath);
                    return;
                }
                this.plugin.processed();
            } catch (error) {
                console.error(`Delete failed for ${cleanPath}:`, error);
                failedPaths.push(fullPath);
            }
        };

        const retryDelete = async (path: string): Promise<void> => {
            try {
                if (await client.exists(path)) {
                    const response = await client.delete(path);
                    if (response) {
                        this.plugin.processed();
                        console.log(`Retry successful: ${path}`);
                    }
                } else {
                    console.log(`File already deleted or doesn't exist: ${path}`);
                    this.plugin.processed();
                }
            } catch (error) {
                console.error(`Final delete attempt failed for ${path}:`, error);
            }
        };

        // First attempt for all files
        await Promise.all(Object.keys(fileTree).map(deleteFile));

        // Retry failed deletions
        if (failedPaths.length > 0) {
            console.log(`Retrying ${failedPaths.length} failed deletions...`);
            await Promise.all(failedPaths.map(retryDelete));
        }
    }

    /**
     * Delete files from local storage
     */
    async deleteFilesLocal(fileTree: FileList): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            this.plugin.log("No files to delete locally");
            return;
        }

        for (const file of Object.keys(fileTree)) {
            await this.deleteLocalFile(file);
        }
    }

    private async ensureRemoteDirectory(webdavClient: WebDAVClient, path: string, basePath: string): Promise<void> {
        try {
            console.log(`Creating remote directory: ${path}`);
            const response = await webdavClient.createDirectory(join(basePath, path.replace(/\/$/, "")));
            if (!response) {
                throw new Error(`Failed to create remote directory ${path}`);
            }
            this.plugin.processed();
        } catch (error) {
            console.error(`Error creating remote directory ${path}:`, error);
        }
    }

    private async deleteLocalFile(file: string): Promise<void> {
        try {
            if (this.plugin.mobile) {
                await this.plugin.app.vault.adapter.trashLocal(file);
            } else {
                await this.plugin.app.vault.adapter.trashSystem(file);
            }
            // console.log(`Deleted locally: ${file}`);
            this.plugin.processed();
        } catch (error) {
            console.error(`Error deleting local file ${file}:`, error);
        }
    }

    async test(show = true, force = false) {
        // if (!force && (this.status !== Status.NONE && this.status !== Status.OFFLINE )) {
        //     show && this.show(`Testing not possible, currently ${this.status}`);
        //     return;
        // }

        // show && this.setStatus(Status.TEST);
        // show && this.show(`${Status.TEST} Testing ...`);

        try {
            const existBool = await this.plugin.webdavClient.exists(this.plugin.settings.webdavPath);
            this.plugin.log("EXISTS: ", existBool);

            if (existBool) {
                show && this.plugin.show("Connection successful");
                show && this.plugin.setStatus(Status.NONE);
                // this.plugin.setStatus(Status.NONE);
                return true;
            }
            show && this.plugin.show("Connection failed");
            this.plugin.setStatus(Status.OFFLINE);

            // this.plugin.setError(!existBool);  // THIS WAS THE ISSUE

            return false;
        } catch (error) {
            show && this.plugin.show(`WebDAV connection test failed. Error: ${error}`);
            console.error("Failed miserably", error);
            this.plugin.setStatus(Status.ERROR);
            this.plugin.setError(true);
            return false;
        }
    }

    async check(show = true, exclude = true) {
        if (this.plugin.status !== Status.NONE && this.plugin.status !== Status.OFFLINE) {
            show && this.plugin.show(`Checking not possible, currently ${this.plugin.status}`);
            return;
        }

        this.plugin.setStatus(Status.CHECK);
        show && this.plugin.show(`${Status.CHECK} Checking ...`);

        let response;
        try {
            response = await this.test(false, true);
            if (!response) {
                // throw new Error("Testing failed, can't continue Check action!");
                this.plugin.log("Testing failed, can't continue Check action!");
                return false;
            }

            this.plugin.checkTime = Date.now();

            const webdavPromise = this.plugin.checksum.generateWebdavHashTree(
                this.plugin.webdavClient,
                this.plugin.baseWebdav,
                this.plugin.settings.exclusions
            );
            // default true
            const localPromise = this.plugin.checksum.generateLocalHashTree(exclude);

            const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);

            this.plugin.allFiles.local = localFiles;
            this.plugin.allFiles.webdav = webdavFiles;

            this.plugin.log("WEBDAV:", webdavFiles);
            this.plugin.log("LOCAL", localFiles);

            const comparedFileTrees = await this.plugin.compare.compareFileTrees(
                webdavFiles,
                localFiles,
                this.plugin.prevData,
                this.plugin.settings.exclusions
            );
            this.plugin.log(JSON.stringify(comparedFileTrees, null, 2));
            this.plugin.fileTrees = comparedFileTrees;
            // if (this.plugin.modal) {
            //     this.plugin.modal.fileTreeDiv.setText(JSON.stringify(this.plugin.fileTrees, null, 2));
            // }
            this.plugin.checkTime = Date.now();

            // show && (fileTreesEmpty(this.plugin.fileTrees) ? null : this.plugin.show("Finished checking files"));
            show && this.plugin.show("Finished checking files");
            this.plugin.lastScrollPosition = 0;
            this.plugin.modal?.renderFileTrees();
            this.plugin.setStatus(Status.NONE);
            return true;
        } catch (error) {
            console.error("CHECK ERROR: ", error);
            show && this.plugin.show("CHECK ERROR: " + error);
            this.plugin.setError(true);
            response ? this.plugin.setStatus(Status.ERROR) : this.plugin.setStatus(Status.OFFLINE);
            throw error;
        }
    }
    async sync(controller: Controller, show = true) {
        if (this.plugin.prevData.error) {
            show && this.plugin.show("Error detected - please clear in control panel or force action by retriggering action");
            return;
        }

        try {
            if (!(await this.test(false))) {
                show && this.plugin.show("Connection Problem detected!");
                return;
            }

            if (this.plugin.status !== Status.NONE) {
                show && this.plugin.show(`Operation not possible, currently working on '${this.plugin.status}'`);
                return;
            }
            if (!this.plugin.fileTrees) {
                show && this.plugin.show("Checking files before operation...");
                const response = await this.check(show);
                console.log("SYNC CHECK FAIL CORRECT");
                if (!response) {
                    return;
                }
            }

            this.plugin.setStatus(Status.SYNC);

            // Calculate total operations needed
            const operationsToCount = [];

            if (controller.webdav) {
                if (controller.webdav.added) operationsToCount.push(this.plugin.fileTrees.webdavFiles.added);
                if (controller.webdav.modified) operationsToCount.push(this.plugin.fileTrees.webdavFiles.modified);
                if (controller.webdav.deleted) operationsToCount.push(this.plugin.fileTrees.webdavFiles.deleted);
                if (controller.webdav.except) operationsToCount.push(this.plugin.fileTrees.webdavFiles.except);
            }

            if (controller.local) {
                if (controller.local.added) operationsToCount.push(this.plugin.fileTrees.localFiles.added);
                if (controller.local.modified) operationsToCount.push(this.plugin.fileTrees.localFiles.modified);
                if (controller.local.deleted) operationsToCount.push(this.plugin.fileTrees.localFiles.deleted);
                if (controller.local.except) operationsToCount.push(this.plugin.fileTrees.localFiles.except);
            }

            const total = this.plugin.calcTotal(...operationsToCount.filter(Boolean));
            if (total === 0) {
                show && this.plugin.show("No files to sync");
                this.plugin.setStatus(Status.NONE);
                return;
            }
            this.plugin.statusBar2.setText(" 0/" + this.plugin.loadingTotal);

            show && this.plugin.show("Synchronizing...");

            const operations: Promise<void>[] = [];

            // Handle WebDAV operations
            if (controller.webdav) {
                if (controller.webdav.added === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.added,
                            this.plugin.baseWebdav
                        )
                    );
                } else if (controller.webdav.added === -1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(
                            this.plugin.webdavClient,
                            this.plugin.baseWebdav,
                            this.plugin.fileTrees.webdavFiles.added
                        )
                    );
                }

                if (controller.webdav.deleted === 1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.webdavFiles.deleted));
                } else if (controller.webdav.deleted === -1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.deleted,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.webdav.modified === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.modified,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.webdav.except === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.except,
                            this.plugin.baseWebdav
                        )
                    );
                }
            }

            // Handle Local operations
            if (controller.local) {
                if (controller.local.added === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.added,
                            this.plugin.baseWebdav
                        )
                    );
                } else if (controller.local.added === -1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.localFiles.added));
                }

                if (controller.local.deleted === 1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(
                            this.plugin.webdavClient,
                            this.plugin.baseWebdav,
                            this.plugin.fileTrees.localFiles.deleted
                        )
                    );
                } else if (controller.local.deleted === -1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.deleted,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.local.modified === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.modified,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.local.except === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.except,
                            this.plugin.baseWebdav
                        )
                    );
                }
            }

            // Execute all operations concurrently
            await Promise.all(operations);
            this.plugin.setStatus(Status.NONE)

            this.cleanUp();

            show && this.plugin.show("Sync completed - checking again");
            await this.plugin.saveState();
            await this.check(true);
            show && this.plugin.show("Done");
            this.plugin.setStatus(Status.NONE);
        } catch (error) {
            console.error("SYNC", error);
            show && this.plugin.show("SYNC Error: " + error);
            this.plugin.setError(true);
            this.plugin.setStatus(Status.ERROR);
        } finally {
            // @ts-ignore
            // if (this.plugin.status !== Status.ERROR) {
            //     this.plugin.setStatus(Status.NONE); //Status.OK); war eigentlich so
            // }
            this.plugin.finished();
        }
    }

    cleanUp(){
        this.plugin.tempExcludedFiles = {}
      
        // Object.keys(this.plugin.tempExcludedFiles).forEach((path)=>{
        //     if (this.plugin.tempExcludedFiles[path].type === "except"){
        //         // are already gone
        //         // delete this.plugin.fileTrees.localFiles.except[path] 
        //         // delete this.plugin.fileTrees.webdavFiles.except[path] 

        //         delete this.plugin.tempExcludedFiles[path]
        //     } else {
        //         delete this.plugin.tempExcludedFiles[path]
        //     }
        // })
    }
}
