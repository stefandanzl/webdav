import { WebDAVClient } from "./webdav";
import Cloudr from "./main";
import { extname } from "./util";
import { TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { createHash } from "crypto";
import { createHash as uintCreateHash } from "sha1-uint8array";

interface WebDAVItem {
    filename: string;
    type: 'directory' | 'file';
    props: {
        checksum?: string;
        checksums?: {
            checksum: string;
        };
    };
}

export class Checksum {
     localFiles: Record<string, string> = {};

    constructor(private plugin: Cloudr) {}

     isExcluded(filePath: string): boolean {
        if (this.plugin.settings.exclusionsOverride) {
            return false;
        }

        const { extensions = [], directories = [], markers = [] } = this.plugin.settings.exclusions;
        const excludedDirs = [...directories];

        // Handle hidden files exclusion
        if ((this.plugin.mobile && this.plugin.settings.skipHiddenMobile) ||
            (!this.plugin.mobile && this.plugin.settings.skipHiddenDesktop)) {
            excludedDirs.push(".obsidian");
        }

        // Check directory exclusions
        const folders = filePath.split("/");
        if (!filePath.endsWith("/")) {
            folders.pop();
        }
        if (folders.some(folder => excludedDirs.includes(folder))) {
            return true;
        }

        // Check file extensions
        const extension = extname(filePath).toLowerCase();
        if (extensions.includes(extension)) {
            return true;
        }

        // Check markers
        return markers.some(marker => filePath.includes(marker));
    }

     sha1(data: string): string {
        if (this.plugin.mobile) {
            return uintCreateHash().update(data).digest("hex");
        }
        return createHash("sha1").update(data).digest("hex");
    }

     async processFiles(files: string[], exclude: boolean, concurrency: number): Promise<void> {
        const chunks = this.chunkArray(files, concurrency);
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(async file => {
                try {
                    if (exclude && this.isExcluded(file)) {
                        return;
                    }
                    const data = await this.plugin.app.vault.adapter.read(file);
                    this.localFiles[file] = this.sha1(data);
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                }
            }));
        }
    }

     chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    async getHiddenLocalFiles(path: string, exclude = true, concurrency = 15): Promise<void> {
        const { files, folders } = await this.plugin.app.vault.adapter.list(path);
        
        await this.processFiles(files, exclude, concurrency);

        await Promise.all(folders.map(async folder => {
            try {
                const folderPath = folder + "/";
                if (!exclude || !this.isExcluded(folderPath)) {
                    this.localFiles[folderPath] = "";
                    await this.getHiddenLocalFiles(normalizePath(folder), exclude, concurrency);
                }
            } catch (error) {
                console.error(`Error processing folder ${folder}:`, error);
            }
        }));
    }

    async generateLocalHashTree(): Promise<Record<string, string>> {
        this.localFiles = {};
        const files = this.plugin.app.vault.getAllLoadedFiles();

        await Promise.all(files.map(async element => {
            try {
                if (element instanceof TFile) {
                    if (!this.isExcluded(element.path)) {
                        const content = await this.plugin.app.vault.read(element);
                        this.localFiles[element.path] = this.sha1(content);
                    }
                } else if (element instanceof TFolder) {
                    const folderPath = element.path + "/";
                    if (!this.isExcluded(folderPath) && folderPath !== "//") {
                        this.localFiles[folderPath] = "";
                    }
                }
            } catch (error) {
                console.error(`Error processing ${element.path}:`, error);
            }
        }));

        this.plugin.localFiles = this.localFiles;
        return this.localFiles;
    }

    async generateWebdavHashTree(
        webdavClient: WebDAVClient, 
        rootFolder: string
    ): Promise<Record<string, string> | Error> {
        try {
            const exists = await webdavClient.exists(rootFolder);
            if (!exists) {
                await webdavClient.createDirectory(rootFolder);
            }

            const data  = await webdavClient.getDirectory(rootFolder, "infinity");
            const refinedResult = this.processWebDAVItems(data, rootFolder);
            
            this.plugin.webdavFiles = refinedResult;
            return refinedResult;
        } catch (error) {
            console.error("WebDAV Error:", error);
            return error as Error;
        }
    }

     processWebDAVItems(items: WebDAVItem[], rootFolder: string): Record<string, string> {
        const result: Record<string, string> = {};

        items.forEach(item => {
            if (this.isExcluded(item.filename)) {
                return;
            }

            const relativePath = item.filename.replace(rootFolder, '');
            result[relativePath] = item.props.checksum || '';
        });

        return result;
    }
}