import { WebDAVClient, WebDAVDirectoryItem } from "./webdav";

import Cloudr from "./main";
import { extname, sha1 } from "./util";
import {
    TAbstractFile,
    TFile,
    TFolder,
    normalizePath, // App, Vault,
} from "obsidian";

export class Checksum {
    localFiles: Record<string, string> = {};

    constructor(public plugin: Cloudr) {
        this.plugin = plugin;
    }

    refineObject(data: WebDAVDirectoryItem[], exclusions) {
        const refinedObject = {};

        data.forEach((item) => {
            // console.log(item)
            const { filename, type, props } = item;

            // const isDirectory = type === "directory";
            // const fullPath = isDirectory ? filename + "/" : filename;

            // const fullPath = filename;

            if (this.isExcluded(filename)) {
                return; // Skip excluded files and folders
            }

            // if (props && props.checksums && props.checksums.checksum) {
            //     const checksum = props.checksums.checksum;
            if (props && props.checksum) {
                const checksum = props.checksum;
                refinedObject[filename] = checksum;
            } else {
                refinedObject[filename] = "";
            }
        });
        return refinedObject;
    }

    // returns true if is excluded and false if is included
    isExcluded(filePath: string) {
        //, exclusions: { extensions?: string[], directories?: string[], markers?: string[] }) {
        // const { extensions = [], directories = [], markers = [] } = exclusions;
        const { extensions = [], directories = [], markers = [] } = this.plugin.settings.exclusions;

        const directoriesMod = [...directories]; // necessary because otherwise original array will be manipulated!

        if (this.plugin.mobile) {
            if (this.plugin.settings.skipHiddenMobile) {
                directoriesMod.push(".obsidian");
            }
        } else {
            if (this.plugin.settings.skipHiddenDesktop) {
                directoriesMod.push(".obsidian");
            }
        }

        if (this.plugin.settings.exclusionsOverride) {
            return false;
        }

        const folders = filePath.split("/");
        if (!filePath.endsWith("/")) {
            folders.pop();
        }
        if (folders.some((folder) => directoriesMod.includes(folder))) {
            return true;
        }

        // Check file extensions
        const extension = extname(filePath).toLowerCase();
        if (extensions.includes(extension)) {
            return true;
        }

        // Check markers
        if (markers.some((marker) => filePath.includes(marker))) {
            return true;
        }

        return false;
    }

    removeBase(fileChecksums, basePath: string) {
        const removedBase = {};

        for (const [filePath, checksum] of Object.entries(fileChecksums)) {
            // Check if the file path starts with the base path
            if (filePath.startsWith(basePath)) {
                // Remove the base path from the file path
                const relativePath: string = filePath.substring(basePath.length).replace(/^\//, "");
                removedBase[relativePath] = checksum;
            } else {
                // If the file path doesn't start with the base path, keep it unchanged
                removedBase[filePath] = checksum;
            }
        }

        return removedBase;
    }

    // use exclude = false to disable exclusion detection
    async getHiddenLocalFiles(path: string, exclude = true, concurrency = 15) {
        const { files, folders } = await this.plugin.app.vault.adapter.list(path);

        const processFile = async (file) => {
            try {
                console.log(file);

                if (exclude && this.isExcluded(file)) {
                    return;
                }

                const data = await this.plugin.app.vault.adapter.read(file);
                // this.localFiles[file] = CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
                this.localFiles[file] = sha1(data);
            } catch (error) {
                console.error("TF", file, error);
            }
        };

        // Use a helper function to limit concurrency
        const processWithConcurrency = async (files, worker) => {
            const results = [];
            let index = 0;

            const processNext = async () => {
                if (index < files.length) {
                    const current = index++;
                    results[current] = await worker(files[current]);
                    await processNext();
                }
            };

            const workers = Array.from({ length: concurrency }, () => processNext());

            await Promise.all(workers);
            return results;
        };

        // Process files concurrently with the specified concurrency level
        await processWithConcurrency(files, processFile);

        // Recursively process folders concurrently
        await Promise.all(
            folders.map(async (folder) => {
                try {
                    console.log(folder + "/");

                    if (exclude) {
                        if (!this.isExcluded(folder + "/")) {
                            this.localFiles[folder + "/"] = "";
                            await this.getHiddenLocalFiles(normalizePath(folder), exclude, concurrency);
                        }
                    } else {
                        this.localFiles[folder + "/"] = "";
                        await this.getHiddenLocalFiles(normalizePath(folder), exclude, concurrency);
                    }
                } catch (error) {
                    console.error("AA", error, folder);
                }
            })
        );
    }

    generatePrevHashTree = async () => {
        this.localFiles = {};

        const localTFiles: TAbstractFile[] = this.plugin.app.vault.getAllLoadedFiles();

        await Promise.all(
            localTFiles.map(async (element) => {
                // const filePath = element.path
                try {
                    // console.log("FILE",element)
                    if (element instanceof TFile) {
                        const filePath = element.path;

                        const content = await this.plugin.app.vault.read(element);

                        this.localFiles[filePath] = sha1(content);
                    } else if (element instanceof TFolder) {
                        const filePath = element.path + "/";
                        if (filePath === "//") {
                            return;
                        }
                        this.localFiles[filePath] = "";
                    } else {
                        console.error("NEITHER FILE NOR FOLDER? ", element);
                    }
                } catch (error) {
                    console.error("localTFiles Errororr", element, error);
                }
            })
        );

        this.localFiles[".obsidian/"] = "";
        await this.getHiddenLocalFiles(normalizePath(".obsidian"), false);

        // this.plugin.localFiles = this.localFiles
        return this.localFiles;
    };

    generateLocalHashTree = async () => {
        // const rootFolder = self.basePath;
        // const checksumTable = {};
        this.localFiles = {};

        const localTFiles: TAbstractFile[] = this.plugin.app.vault.getAllLoadedFiles();

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // const rootChecksum = this.processFolder(rootFolder, checksumTable, exclusions, rootFolder);
        // localFiles.forEach( async(element) => {
        await Promise.all(
            localTFiles.map(async (element) => {
                // const filePath = element.path
                try {
                    // console.log("FILE",element)
                    if (element instanceof TFile) {
                        const filePath = element.path;
                        if (this.isExcluded(filePath)) {
                            return;
                        }
                        const content = await this.plugin.app.vault.read(element);
                        // this.localFiles[filePath] = createHash('sha1').update(content).digest('hex');
                        // this.localFiles[filePath] = CryptoJS.SHA1(content).toString(CryptoJS.enc.Hex);
                        // this.localFiles[filePath] = sha1.update(content).hex();
                        this.localFiles[filePath] = sha1(content);
                    } else if (element instanceof TFolder) {
                        const filePath = element.path + "/";
                        if (this.isExcluded(filePath) || filePath === "//") {
                            return;
                        }
                        this.localFiles[filePath] = "";
                    } else {
                        console.error("NEITHER FILE NOR FOLDER? ", element);
                    }
                } catch (error) {
                    console.error("localTFiles Errororr", element, error);
                }
            })
        );
        // if (!this.plugin.settings.skipHidden) {
        //     this.localFiles[".obsidian/"] = "";
        //     await this.getHiddenLocalFiles(normalizePath(".obsidian"));
        // }
        this.plugin.localFiles = this.localFiles;
        return this.localFiles;
    };

    // Fetch directory contents from webdav
    generateWebdavHashTree = async (webdavClient: WebDAVClient, rootFolder: string, exclusions: Record) => {
        try {
            const exists = await webdavClient.exists(rootFolder);
            if (exists) {
                console.log("ROOTFOLDER DOES EXIST");
            } else {
                console.log("DOES NOT EXIST");
                await webdavClient.createDirectory(rootFolder);
            }
        } catch (error) {
            console.error("ERROR: generateWebdavHashTree", error);
            return error;
        }

        // exclusions.directories = exclusions.directories || [];
        // exclusions.directories.push("node_modules", ".git", "plugins/remotely-sync", "remotely-sync/src", "obsidian-cloudr");

        try {
            // Get directory contents - deep true, details true
            // const contents = await webdavClient.getDirectoryContents(rootFolder, {
            //   deep: true,
            //   details: true,
            // }); //details: true

            const contents = await webdavClient.getDirectory(rootFolder, "infinity");

            console.log("Contents:", JSON.stringify(contents, null, 2));

            // console.log("Contents:", JSON.stringify(contents));
            // writeFileSync("out/output-webdav1.json", JSON.stringify(contents, null, 2));

            const refinedResult = this.refineObject(contents, exclusions);

            const webdavHashtree = this.removeBase(refinedResult, rootFolder);
            // writeFileSync("out/output-webdav2.json", JSON.stringify(refinedResult, null, 2));
            console.log("webdav: ", webdavHashtree);
            this.plugin.webdavFiles = webdavHashtree;
            return webdavHashtree;
        } catch (error) {
            console.error("Error:", error);
            return error;
        }
    };
}
