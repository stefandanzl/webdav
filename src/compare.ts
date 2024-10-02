// @ts-nocheck
import Cloudr from "./main";
import {
  extname, //checksum// sha1 // emptyObj, join,
} from "./util";

export class Compare {
  constructor(public plugin: Cloudr) {
    this.plugin = plugin;
  }
  // Function to compare two file trees and find changes
  compareFileTreesExcept(
    webdavFiles: {
      added: object;
      modified: object;
      deleted: object;
      except: object;
    },
    localFiles: {
      added: object;
      modified: object;
      deleted: object;
      except: object;
    }
  ) {
    // console.log("COMPAREFILETREESEXCEPT",webdavFiles, localFiles)

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

    // console.log("SSSSSSSSSS");

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
  async comparePreviousFileTree(previousObj, current) {
    const previous = previousObj.files;
    const added = {};
    const deleted = {};
    const modified = {};
    const { removedItems, remainingItems } = this.checkExistKeyBoth(
      current,
      previousObj.except
    );
    const except = remainingItems;
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
        console.log("HAAAA ", file);
      }
    }

    return { added, deleted, modified, except };
  }

  checkExistKey = (sourceObject, referenceObject) => {
    return Object.fromEntries(
      Object.entries(sourceObject).filter(([key]) => key in referenceObject)
    );
  };

  checkExistKeyBoth = (sourceObject = {}, referenceObject = {}) => {
    const removedItems = {};
    const remainingItems = {};

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
    fileTree: object,
    exclusions: {
      extensions?: string[];
      directories?: string[];
      markers?: string[];
    }
  ) => {
    const {
      extensions = [],
      directories = [],
      markers = [],
    } = this.plugin.settings.exclusions;
    let filtered = {};
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
    webdavFiles,
    localFiles,
    prevFileTree = {},
    exclusions: {
      extensions?: string[];
      directories?: string[];
      markers?: string[];
    }
  ): { webdavFiles; localFiles } => {
    // const files1 = Object.keys(webdavFiles)
    // const files2 = Object.keys(localFiles)
    // const files3 = Object.keys(prevFileTree.files)

    // console.log("prevFileTree.files: ",prevFileTree.files)
    // console.log("Object.keys(prevFileTree.files) > 0",Object.keys(prevFileTree.files).length > 0)

    let webdavMatch, localMatch;

    if (
      prevFileTree.files &&
      Object.keys(prevFileTree.files).length > 0 &&
      Object.keys(webdavFiles).length > 0
    ) {
      try {
        prevFileTree.files = this.filterExclusions(
          prevFileTree.files,
          exclusions
        );

        console.log("PREV", prevFileTree);
        console.log("WEBD", webdavFiles);
        console.log("LOC", localFiles);

        // let webdavFilesBranch
        // let localFilesBranch
        // const differingFiles = compareFileTrees(webdavFiles, localFiles);
        // const webdavFilesPromise = await this.comparePreviousFileTree(prevFileTree, webdavFiles);
        const webdavFilesBranch = await this.comparePreviousFileTree(
          prevFileTree,
          webdavFiles
        );

        console.log("webdavFilesBranch", webdavFilesBranch);

        // const localFilesPromise = await this.comparePreviousFileTree(prevFileTree, localFiles);
        const localFilesBranch = await this.comparePreviousFileTree(
          prevFileTree,
          localFiles
        );
        console.log("localFilesBranch", localFilesBranch);

        ({ webdavMatch, localMatch } = this.compareFileTreesExcept(
          webdavFilesBranch,
          localFilesBranch
        ));
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
        ({ webdavMatch, localMatch } = this.compareFileTreesExcept(
          webdavFilesBranch,
          localFilesBranch
        ));
      }
    }

    return { webdavFiles: webdavMatch, localFiles: localMatch };
  };
}
