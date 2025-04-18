import Cloudr from "./main";
import { extname } from "./util";
import { FileTree, FileList, FileTrees } from "./const";

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

        // Identify where hashes didn't change and remove them from fileTree, as they didn't change
        for (const file1 in webdavFiles.added) {
            if (localFiles.added[file1] === webdavFiles.added[file1]) {
                delete webdavFiles.added[file1];
                delete localFiles.added[file1];
            } else if (localFiles.added[file1]) {
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
            }
        }

        return { webdavMatch: webdavFiles, localMatch: localFiles };
    }

    // Function to compare two file trees and find changes
    async comparePreviousFileTree(previousFiles: FileList, previousExcept: FileList, currentFiles: FileList) {
        const fileTree: FileTree = {
            added: {},
            deleted: {},
            modified: {},
            except: this.checkExistKey(previousExcept, currentFiles),
        };

        // Identify added and modified files
        for (const [currentFile, currentHash] of Object.entries(currentFiles)) {
            const matchingHash = previousFiles[currentFile];

            if (previousFiles[currentFile] === currentFiles[currentFile]) {
                // nothing
            } else if (!matchingHash) {
                fileTree.added[currentFile] = currentHash;
            } else if (matchingHash !== currentHash) {
                fileTree.modified[currentFile] = currentHash;
            }
        }

        /**
         * Correct previous except files that could now be found in modified
         */
        Object.keys(previousExcept).forEach((path) => {
            if (path in fileTree.modified) {
                fileTree.except[path] = fileTree.modified[path];
                delete fileTree.modified[path];
            }
        });

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

        for (const [file] of Object.entries(previousFiles)) {
            if (!currentFiles.hasOwnProperty(file)) {
                // The key is not in the current object
                fileTree.deleted[file] = previousFiles[file];
            }
        }

        return fileTree;
    }

    /**
     *  Keeps only the items from sourceObject that also exist in referenceObject
     */
    checkExistKey = (sourceObject: FileList, referenceObject: FileList) => {
        return Object.fromEntries(
            // Convert back to object
            Object.entries(sourceObject) // Convert object to [key, value] pairs
                .filter(([key]) => key in referenceObject) // Keep only if key exists in reference
        );
    };

    /** This function splits sourceObject into two objects:
     * - removedItems: items that don't exist in referenceObject
     * - remainingItems: items that do exist in referenceObject
     */
    checkExistKeyBoth = (sourceObject: FileList, referenceObject: FileList) => {
        const removedItems: FileList = {};
        const remainingItems: FileList = {};

        for (const key in sourceObject) {
            if (Object.prototype.hasOwnProperty.call(referenceObject, key)) {
                remainingItems[key] = sourceObject[key]; // Key exists in both
            } else {
                removedItems[key] = sourceObject[key]; // Key only in source
            }
        }

        return [removedItems, remainingItems];
    };

    filterExclusions = (fileTree: FileList) => {
        let filtered: FileList = {};
        const directoriesMod = structuredClone(this.plugin.settings.exclusions.directories); // necessary because otherwise original array will be manipulated!

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
            filtered = structuredClone(fileTree);
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
                if (this.plugin.settings.exclusions.extensions.includes(extension)) {
                    continue;
                }

                // Check markers
                if (this.plugin.settings.exclusions.markers.some((marker) => filePath.includes(marker))) {
                    continue;
                }

                filtered[filePath] = fileTree[filePath];
            }
        }
        return filtered;
    };

    compareFileTrees = async (webdavFiles: FileList, localFiles: FileList): Promise<FileTrees> => {
        // Initialize default file trees structure
        const fileTreeMatch: FileTrees = {
            webdavFiles: { added: {}, deleted: {}, modified: {}, except: {} },
            localFiles: { added: {}, deleted: {}, modified: {}, except: {} },
        };

        // Case 1: No previous file tree or no webdav files
        if (!this.plugin.prevData.files || Object.keys(this.plugin.prevData.files).length === 0 || Object.keys(webdavFiles).length === 0) {
            if (Object.keys(webdavFiles).length === 0) {
                // Only local files exist
                fileTreeMatch.localFiles.added = localFiles;
                return fileTreeMatch;
            }

            // Both webdav and local files exist, but no previous state
            const initialTrees = {
                webdav: { added: webdavFiles, deleted: {}, modified: {}, except: {} },
                local: { added: localFiles, deleted: {}, modified: {}, except: {} },
            };

            const { webdavMatch, localMatch } = this.compareFileTreesExcept(initialTrees.webdav, initialTrees.local);
            return { webdavFiles: webdavMatch, localFiles: localMatch };
        }
        /**
         * Regular workflow ...
         */

        // Case 2: Compare with previous state
        try {
            const filteredPrevTree = this.filterExclusions(this.plugin.prevData.files);
            const filteredExcepts = this.filterExclusions(this.plugin.prevData.except);

            const [webdavFilesBranch, localFilesBranch] = await Promise.all([
                this.comparePreviousFileTree(filteredPrevTree, filteredExcepts, webdavFiles),
                this.comparePreviousFileTree(filteredPrevTree, filteredExcepts, localFiles),
            ]);

            webdavFilesBranch.except = { ...this.plugin.prevData.except, ...webdavFilesBranch.except };
            localFilesBranch.except = { ...this.plugin.prevData.except, ...localFilesBranch.except };

            const { webdavMatch, localMatch } = this.compareFileTreesExcept(webdavFilesBranch, localFilesBranch);

            // Post-process deleted files
            webdavMatch.deleted = this.checkExistKey(webdavMatch.deleted, localFiles);
            localMatch.deleted = this.checkExistKey(localMatch.deleted, webdavFiles);

            return { webdavFiles: webdavMatch, localFiles: localMatch };
        } catch (error) {
            console.error("File comparison error:", error);
            throw error;
        }
    };
}
