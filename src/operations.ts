// @ts-nocheck
import Cloudr from "./main";
// import { WebDAVClient, createClient } from "webdav";
import { WebDAVClient } from "./webdav";
import { join, dirname } from "./util";
import { normalizePath } from "obsidian";

const WEBDAV_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate"
};

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
            headers: WEBDAV_HEADERS
        });
    }

    /**
     * Download files from WebDAV server
     */
    async downloadFiles(
        webdavClient: WebDAVClient,
        filesMap: Record<string, string>,
        remoteBasePath: string
    ): Promise<void> {
        if (!filesMap || Object.keys(filesMap).length === 0) {
            console.log("No files to download");
            return;
        }

        await Promise.all(
            Object.entries(filesMap).map(([filePath, _]) => 
                this.downloadFile(webdavClient, filePath, remoteBasePath)
            )
        );
    }

    /**
     * Download a single file from WebDAV
     */
    private async downloadFile(
        webdavClient: WebDAVClient,
        filePath: string,
        remoteBasePath: string
    ): Promise<void> {
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
            
            await app.vault.adapter.writeBinary(filePath, fileData);
            this.plugin.processed();
            console.log(`Downloaded: ${remotePath}`);
        } catch (error) {
            console.error(`Error downloading ${filePath}:`, error);
        }
    }

    /**
     * Upload files to WebDAV server
     */
    async uploadFiles(
        webdavClient: WebDAVClient,
        fileChecksums: object | undefined,
        remoteBasePath: string
    ): Promise<void> {
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
    private async uploadFile(
        webdavClient: WebDAVClient,
        localFilePath: string,
        remoteBasePath: string
    ): Promise<void> {
        try {
            if (localFilePath.endsWith("/")) {
                await this.ensureRemoteDirectory(webdavClient, localFilePath, remoteBasePath);
                return;
            }

            const fileContent = await this.plugin.app.vault.adapter.read(
                normalizePath(localFilePath)
            );
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
    async deleteFilesWebdav(
        client: WebDAVClient,
        basePath: string,
        fileTree: object | undefined
    ): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            console.log("No files to delete on WebDAV");
            return;
        }

        for (const file of Object.keys(fileTree)) {
            await this.deleteWebDavFile(client, file, basePath);
        }
    }

    /**
     * Delete files from local storage
     */
    async deleteFilesLocal(
        fileTree: object | undefined
    ): Promise<void> {
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
    ): Promise<Buffer> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // return await webdavClient.getFileContents(remotePath, {
                //     format: "binary"
                // });
                return await webdavClient.get(remotePath);
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`Retry ${attempt} for ${remotePath}`);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        throw new Error(`Failed to download after ${maxRetries} attempts`);
    }

    private async ensureLocalDirectory(path: string): Promise<void> {
        const exists = await app.vault.adapter.exists(path);
        if (!exists) {
            console.log(`Creating local directory: ${path}`);
            await app.vault.createFolder(path);
        }
    }

    private async ensureRemoteDirectory(
        webdavClient: WebDAVClient,
        path: string,
        basePath: string
    ): Promise<void> {
        try {
            console.log(`Creating remote directory: ${path}`);
            await webdavClient.createDirectory(
                join(basePath, path.replace(/\/$/, ""))
            );
        } catch (error) {
            console.error(`Error creating remote directory ${path}:`, error);
        }
    }

    private async deleteWebDavFile(
        webdavClient: WebDAVClient,
        file: string,
        basePath: string
    ): Promise<void> {
        const path = file.endsWith("/") ? file.replace(/\/$/, "") : file;
        try {
            await this.deleteWithRetry(webdavClient, join(basePath, path));
            this.plugin.processed();
            console.log(`Deleted from WebDAV: ${path}`);
        } catch (error) {
            console.error(`Failed to delete ${path} from WebDAV:`, error);
        }
    }

    private async deleteWithRetry(
        webdavClient: WebDAVClient,
        path: string,
        maxRetries = 2
    ): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await webdavClient.deleteFile(path);
                return;
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`Retry ${attempt} for deleting ${path}`);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    private async deleteLocalFile(file: string): Promise<void> {
        try {
            if (this.plugin.mobile) {
                await app.vault.adapter.trashLocal(file);
            } else {
                await app.vault.adapter.trashSystem(file);
            }
            console.log(`Deleted locally: ${file}`);
            this.plugin.processed();
        } catch (error) {
            console.error(`Error deleting local file ${file}:`, error);
        }
    }
}