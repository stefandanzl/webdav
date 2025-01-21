import Cloudr from "./main";
import { extname } from "./util";
import { FileTree, FileList, PreviousObject, Exclusions, FileTrees } from "./const";

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
    async comparePreviousFileTree(previousFiles: FileList, previousExcept: FileList, currentFiles: FileList) {
        // const previousFiles: FileList = previousObj.files;

        // const [removedItems, remainingItems] = this.checkExistKeyBoth(currentFiles, previousExcept);
        // const added: FileList = {};
        // const deleted: FileList = {};
        // const modified: FileList = {};
        // const except: FileList = remainingItems;

        const fileTree: FileTree = {
            added: {},
            deleted: {},
            modified: {},
            except: this.checkExistKey(previousExcept, currentFiles)
        };

        console.log("comparePreviousFileTree-1", fileTree.except);

        // This could be wrong
        // currentFiles = removedItems;
        console.log("comparePreviousFileTree-2", currentFiles);

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
        for (const [file, hash] of Object.entries(previousFiles)) {
            if (!currentFiles.hasOwnProperty(file)) {
                // The key is not in the current object
                fileTree.deleted[file] = previousFiles[file];
                this.plugin.log("HAAAA ", file);
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
                remainingItems[key] = sourceObject[key];  // Key exists in both
            } else {
                removedItems[key] = sourceObject[key];    // Key only in source
            }
        }
    
        return [ removedItems, remainingItems ];
    };

    filterExclusions = (
        fileTree: FileList,
        exclusions: {
            extensions?: string[];
            directories?: string[];
            markers?: string[];
        }
    ) => {
        const { extensions = [], directories = [], markers = [] }: Exclusions = this.plugin.settings.exclusions;
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
    ): Promise<FileTrees> => {
        // Initialize default file trees structure
        const fileTreeMatch: FileTrees = {
            webdavFiles: { added: {}, deleted: {}, modified: {}, except: {} },
            localFiles: { added: {}, deleted: {}, modified: {}, except: {} },
        };

        // Case 1: No previous file tree or no webdav files
        if (!prevFileTree.files || Object.keys(prevFileTree.files).length === 0 || Object.keys(webdavFiles).length === 0) {
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
            const filteredPrevTree = this.filterExclusions(prevFileTree.files, exclusions);
            const filteredExcepts = this.filterExclusions(prevFileTree.except, exclusions);

            console.log("CompareFileTrees-R4", filteredPrevTree);
            console.log("CompareFileTrees-R3", filteredExcepts);

            const [webdavFilesBranch, localFilesBranch] = await Promise.all([
                this.comparePreviousFileTree(filteredPrevTree, filteredExcepts, webdavFiles),
                this.comparePreviousFileTree(filteredPrevTree, filteredExcepts, localFiles),
            ]);

            console.log("CompareFileTrees-R2", localFilesBranch);

            webdavFilesBranch.except = { ...prevFileTree.except, ...webdavFilesBranch.except };
            localFilesBranch.except = { ...prevFileTree.except, ...localFilesBranch.except };

            console.log("CompareFileTrees-R1", localFilesBranch);

            const { webdavMatch, localMatch } = this.compareFileTreesExcept(webdavFilesBranch, localFilesBranch);
            console.log("CompareFileTrees-1", webdavMatch.deleted);
            // Post-process deleted files
            webdavMatch.deleted = this.checkExistKey(webdavMatch.deleted, localFiles);
            localMatch.deleted = this.checkExistKey(localMatch.deleted, webdavFiles);

            console.log("CompareFileTrees-2", webdavMatch.deleted);
            return { webdavFiles: webdavMatch, localFiles: localMatch };
        } catch (error) {
            console.error("File comparison error:", error);
            throw error;
        }
    };
}
