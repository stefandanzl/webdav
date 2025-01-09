import Cloudr from "./main";
import { extname } from "./util";
import { FileTree, FileList , PreviousObject, Exclusions} from "./const";

export class Compare {
    constructor(public plugin: Cloudr) {
        this.plugin = plugin;
    }
    // Function to compare two file trees and find changes
    compareFileTreesExcept(webdavFiles: FileTree, localFiles: FileTree) {
        // Identify added and modified files
        // for (const [file1, hash1] of Object.entries(webdavFiles)) {

        for (const file1 in webdavFiles.modified) {
            if (localFiles.modified[file1]) {
                webdavFiles.except[file1] = webdavFiles.modified[file1];
                localFiles.except[file1] = localFiles.modified[file1];

                delete webdavFiles.modified[file1];
                delete localFiles.modified[file1];
            }
        }

        // console.log("GUGU")

        // Identify where hashes didn't change and remove them from fileTree, as they didn't change
        for (const file1 in webdavFiles.added) {
            if (localFiles.added[file1] === webdavFiles.added[file1]) {
                delete webdavFiles.added[file1];
                delete localFiles.added[file1];
            } else if (localFiles.added[file1]) {
                // if(localFiles.added[file1] === webdavFiles.added[file1]){

                //   delete webdavFiles.added[file1]
                //   delete localFiles.added[file1]
                // }
                webdavFiles.except[file1] = webdavFiles.added[file1];
                localFiles.except[file1] = localFiles.added[file1];

                delete webdavFiles.added[file1];
                delete localFiles.added[file1];
            }
        }
        for (const file1 in localFiles.except) {
            if (localFiles.except[file1] === webdavFiles.except[file1]) {
                delete webdavFiles.except[file1];
                delete localFiles.except[file1];
                // console.log("deleted Except:",file1);
            } else {
                // console.log("special Except: ",file1);
            }
        }

        return { webdavMatch: webdavFiles, localMatch: localFiles };
    }

    // Function to compare two file trees and find changes
    async comparePreviousFileTree(previousObj: { files: FileList; except: FileList }, current: FileList) {
        const previous: FileList = previousObj.files;

        const { removedItems, remainingItems } = this.checkExistKeyBoth(current, previousObj.except);
        const added: FileList = {};
        const deleted: FileList = {};
        const modified: FileList = {};
        const except: FileList = remainingItems;
        current = removedItems;

        // Identify added and modified files
        for (const [currentFile, currentHash] of Object.entries(current)) {
            const matchingHash = previous[currentFile];

            if (previous[currentFile] === current[currentFile]) {
                // nothing
            } else if (!matchingHash) {
                added[currentFile] = currentHash;
            } else if (matchingHash !== currentHash) {
                modified[currentFile] = currentHash;
            }
        }

        // // Identify deleted files
        // for (const [prevFile, prevHash] of Object.entries(previous)) {
        //   if (!current[prevFile]) {

        //     if (current[prevFile] === previous[prevFile]){
        //       // unchanged
        //     } else {
        //       deleted[prevFile] = prevHash;
        //     }
        //   }
        // }

        //@ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [file, hash] of Object.entries(previous)) {
            if (!current.hasOwnProperty(file)) {
                // The key is not in the current object
                deleted[file] = previous[file];
                this.plugin.log("HAAAA ", file);
            }
        }

        return { added, deleted, modified, except };
    }

    checkExistKey = (sourceObject: FileList, referenceObject: FileList) => {
        return Object.fromEntries(Object.entries(sourceObject).filter(([key]) => key in referenceObject));
    };

    checkExistKeyBoth = (sourceObject: FileList, referenceObject: FileList) => {
        const removedItems: FileList = {};
        const remainingItems: FileList = {};

        for (const key in sourceObject) {
            if (Object.prototype.hasOwnProperty.call(referenceObject, key)) {
                remainingItems[key] = sourceObject[key];
            } else {
                removedItems[key] = sourceObject[key];
            }
        }

        return { removedItems, remainingItems };
    };

    filterExclusions = (
        fileTree: FileList,
        exclusions: {
            extensions?: string[];
            directories?: string[];
            markers?: string[];
        }
    ) => {
        const { extensions = [], directories = [], markers = [] }:Exclusions = this.plugin.settings.exclusions;
        let filtered: FileList = {};
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
            filtered = { ...fileTree };
            // return false
        } else {
            for (const filePath in fileTree) {
                const folders = filePath.split("/");
                if (!filePath.endsWith("/")) {
                    folders.pop();
                }
                if (folders.some((folder) => directoriesMod.includes(folder))) {
                    continue;
                }

                // Check file extensions
                const extension = extname(filePath).toLowerCase();
                if (extensions.includes(extension)) {
                    continue;
                }

                // Check markers
                if (markers.some((marker) => filePath.includes(marker))) {
                    continue;
                }

                filtered[filePath] = fileTree[filePath];
            }
        }
        return filtered;
    };

    compareFileTrees = async (
        webdavFiles: FileList,
        localFiles: FileList,
        prevFileTree: PreviousObject,
        exclusions: {
            extensions?: string[];
            directories?: string[];
            markers?: string[];
        }
    ) => {
        let webdavMatch, localMatch;

        if (prevFileTree.files && Object.keys(prevFileTree.files).length > 0 && Object.keys(webdavFiles).length > 0) {
            try {
                prevFileTree.files = this.filterExclusions(prevFileTree.files, exclusions);

                this.plugin.log("PREV", prevFileTree);
                this.plugin.log("WEBD", webdavFiles);
                this.plugin.log("LOC", localFiles);

                const webdavFilesBranch = await this.comparePreviousFileTree(prevFileTree, webdavFiles);

                this.plugin.log("webdavFilesBranch", webdavFilesBranch);

                // const localFilesPromise = await this.comparePreviousFileTree(prevFileTree, localFiles);
                const localFilesBranch = await this.comparePreviousFileTree(prevFileTree, localFiles);
                this.plugin.log("localFilesBranch", localFilesBranch);

                ({ webdavMatch, localMatch } = this.compareFileTreesExcept(webdavFilesBranch, localFilesBranch));
                // [webdavFilesBranch, localFilesBranch] = await Promise.all([webdavFilesPromise, localFilesPromise]);
            } catch (error) {
                console.error("CHECKSU; ERROR, ", error);
                return error;
            }

            webdavMatch.deleted = this.checkExistKey(webdavMatch.deleted, localFiles);
            localMatch.deleted = this.checkExistKey(localMatch.deleted, webdavFiles);
        } else {
            console.log("++ NO PREVIOUS fileTree loaded! ++");

            if (Object.keys(webdavFiles).length === 0) {
                console.log("No Webdav files found!");
                webdavMatch = { added: {}, deleted: {}, modified: {}, except: {} };
                localMatch = {
                    added: localFiles,
                    deleted: {},
                    modified: {},
                    except: {},
                };
            } else {
                console.log("Webdav files found");
                const webdavFilesBranch = {
                    added: webdavFiles,
                    deleted: {},
                    modified: {},
                    except: {},
                };
                console.log("Webdav files found", webdavFilesBranch);

                const localFilesBranch = {
                    added: localFiles,
                    deleted: {},
                    modified: {},
                    except: {},
                };

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                ({ webdavMatch, localMatch } = this.compareFileTreesExcept(webdavFilesBranch, localFilesBranch));
            }
        }

        return { webdavFiles: webdavMatch, localFiles: localMatch };
    };
}
