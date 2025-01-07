
import Cloudr from "./main";
import { WebDAVClient } from "./webdav";
import { join, dirname } from "./util";
import { normalizePath } from "obsidian";
import { Controller } from "./main";

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

    /**
     * Download files from WebDAV server
     */
    async downloadFiles(webdavClient: WebDAVClient, filesMap: Record<string, string>, remoteBasePath: string): Promise<void> {
        if (!filesMap || Object.keys(filesMap).length === 0) {
            console.log("No files to download");
            return;
        }

        await Promise.all(Object.entries(filesMap).map(([filePath, _]) => this.downloadFile(webdavClient, filePath, remoteBasePath)));
    }

    /**
     * Download a single file from WebDAV
     */
    private async downloadFile(webdavClient: WebDAVClient, filePath: string, remoteBasePath: string): Promise<void> {
        try {
            if (filePath.endsWith("/")) {
                await this.ensureLocalDirectory(filePath);
                return;
            }

            const remotePath = join(remoteBasePath, filePath);

            // Verify remote file exists
            const remoteStats = await webdavClient.exists(remotePath);
            if (!remoteStats) {
                console.error(`Remote file not found: ${remotePath}`);
                return;
            }

            // Ensure local directory exists
            await this.ensureLocalDirectory(dirname(filePath));

            // Download with retry
            const fileData = await this.downloadWithRetry(webdavClient, remotePath);
            if (fileData.status !== 200) {
                throw new Error(`Failed to download ${remotePath}: ${fileData.status}`);
            }
            await this.plugin.app.vault.adapter.writeBinary(filePath, fileData.data);
            this.plugin.processed();
            // console.log(`Downloaded: ${remotePath}`);
        } catch (error) {
            console.error(`Error downloading ${filePath}:`, error);
        }
    }

    /**
     * Upload files to WebDAV server
     */
    async uploadFiles(webdavClient: WebDAVClient, fileChecksums: Record<string, string>, remoteBasePath: string): Promise<void> {
        if (!fileChecksums || Object.keys(fileChecksums).length === 0) {
            console.log("No files to upload");
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
            console.log(`Uploaded: ${localFilePath} to ${remoteFilePath}`);
        } catch (error) {
            console.error(`Error uploading ${localFilePath}:`, error);
        }
    }

    /**
     * Delete files from WebDAV server
     */
    async deleteFilesWebdav(client: WebDAVClient, basePath: string, fileTree: Record<string, string>): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            console.log("No files to delete on WebDAV");
            return;
        }
        const maxRetries = 2;

        const deleteFile = async (path: string): Promise<void> => {
            const cleanPath = path.endsWith("/") ? path.replace(/\/$/, "") : path;
            const fullPath = join(basePath, cleanPath);

            // Skip if file doesn't exist

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const response = await client.delete(fullPath);
                    if (!response) {
                        if (!(await client.exists(fullPath))) {
                            console.log(`File already deleted or doesn't exist: ${cleanPath}`);
                            this.plugin.processed();
                            return;
                        } else {
                            throw new Error(`Delete operation failed for ${cleanPath}`);
                        }
                    }
                    // console.log(`Deleted from WebDAV: ${cleanPath}`);
                    this.plugin.processed();
                    return;
                } catch (error) {
                    if (attempt === maxRetries) {
                        console.error(`Failed to delete ${cleanPath} after ${maxRetries} attempts:`, error);
                        return;
                    }
                    console.log(`Retry ${attempt}/${maxRetries} for deleting ${cleanPath}`);
                    await new Promise((resolve) => setTimeout(resolve, 100 * attempt)); // Exponential backoff
                }
            }
        };

        await Promise.all(Object.keys(fileTree).map(deleteFile));
    }

    /**
     * Delete files from local storage
     */
    async deleteFilesLocal(fileTree: Record<string, string>): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            console.log("No files to delete locally");
            return;
        }

        for (const file of Object.keys(fileTree)) {
            await this.deleteLocalFile(file);
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

    private async ensureRemoteDirectory(webdavClient: WebDAVClient, path: string, basePath: string): Promise<void> {
        try {
            console.log(`Creating remote directory: ${path}`);
            const response = await webdavClient.createDirectory(join(basePath, path.replace(/\/$/, "")));
            if (!response) {
                throw new Error(`Failed to create remote directory ${path}`);
            }
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


    async sync(controller: Controller, button = true) {
        if (this.plugin.prevData.error) {
            const action = "sync";
            if (this.plugin.force !== action) {
                this.plugin.setForce(action);
                button && this.plugin.show("Error detected - please clear in control panel or force action by retriggering " + action);
                return;
            }
        }

        if (this.plugin.status) {
            button && this.plugin.show(`Operation not possible, currently working on '${this.plugin.status}'`);
            return;
        }

        try {
            if (!(await this.plugin.test(false))) {
                button && this.plugin.show("Connection Problem detected!");
                return;
            }

            if (!this.plugin.fileTrees) {
                button && this.plugin.show("Checking files before operation...");
                await this.plugin.check();
            }

            this.plugin.setStatus("⏳");

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

            this.plugin.calcTotal(...operationsToCount.filter(Boolean));

            button && this.plugin.show("Synchronizing...");

            const operations: Promise<void>[] = [];

            // Handle WebDAV operations
            if (controller.webdav) {
                if (controller.webdav.added === 1) {
                    operations.push(this.plugin.operations.downloadFiles(this.plugin.webdavClient, this.plugin.fileTrees.webdavFiles.added, this.plugin.baseWebdav));
                } else if (controller.webdav.added === -1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(this.plugin.webdavClient, this.plugin.baseWebdav, this.plugin.fileTrees.webdavFiles.added)
                    );
                }

                if (controller.webdav.deleted === 1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.webdavFiles.deleted));
                } else if (controller.webdav.deleted === -1) {
                    operations.push(this.plugin.operations.downloadFiles(this.plugin.webdavClient, this.plugin.fileTrees.webdavFiles.deleted, this.plugin.baseWebdav));
                }

                if (controller.webdav.modified === 1) {
                    operations.push(this.plugin.operations.downloadFiles(this.plugin.webdavClient, this.plugin.fileTrees.webdavFiles.modified, this.plugin.baseWebdav));
                }

                if (controller.webdav.except === 1) {
                    operations.push(this.plugin.operations.downloadFiles(this.plugin.webdavClient, this.plugin.fileTrees.webdavFiles.except, this.plugin.baseWebdav));
                }
            }

            // Handle Local operations
            if (controller.local) {
                if (controller.local.added === 1) {
                    operations.push(this.plugin.operations.uploadFiles(this.plugin.webdavClient, this.plugin.fileTrees.localFiles.added, this.plugin.baseWebdav));
                } else if (controller.local.added === -1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.localFiles.added));
                }

                if (controller.local.deleted === 1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(this.plugin.webdavClient, this.plugin.baseWebdav, this.plugin.fileTrees.localFiles.deleted)
                    );
                } else if (controller.local.deleted === -1) {
                    operations.push(this.plugin.operations.uploadFiles(this.plugin.webdavClient, this.plugin.fileTrees.localFiles.deleted, this.plugin.baseWebdav));
                }

                if (controller.local.modified === 1) {
                    operations.push(this.plugin.operations.uploadFiles(this.plugin.webdavClient, this.plugin.fileTrees.localFiles.modified, this.plugin.baseWebdav));
                }

                if (controller.local.except === 1) {
                    operations.push(this.plugin.operations.uploadFiles(this.plugin.webdavClient, this.plugin.fileTrees.localFiles.except, this.plugin.baseWebdav));
                }
            }

            // Execute all operations concurrently
            await Promise.all(operations);

            this.plugin.finished();
            button && this.plugin.show("Sync completed - checking again");
            await this.plugin.check(true);
            this.plugin.force = "save";
            await this.plugin.saveState();
            button && this.plugin.show("Done");
        } catch (error) {
            console.error("SYNC", error);
            button && this.plugin.show("SYNC Error: " + error);
            this.plugin.setError(true);
        } finally {
            this.plugin.status = "";
            this.plugin.setStatus("");
        }
    }
}
