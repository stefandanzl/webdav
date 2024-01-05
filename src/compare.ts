// @ts-nocheck

// Function to compare two file trees and find changes
function compareFileTreesExcept(webdavFiles:{added:object,modified:object,deleted:object,except:object}, localFiles:{added:object,modified:object,deleted:object,except:object}) {
 
// console.log("COMPAREFILETREESEXCEPT",webdavFiles, localFiles)

  // Identify added and modified files
  // for (const [file1, hash1] of Object.entries(webdavFiles)) {

  
    for (const file1 in webdavFiles.modified){
    if(localFiles.modified[file1]){
      webdavFiles.except[file1] = webdavFiles.modified[file1]
      localFiles.except[file1] = localFiles.modified[file1]

      delete webdavFiles.modified[file1]
      delete localFiles.modified[file1]
    }
  }

// console.log("GUGU")

  // Identify where hashes didn't change and remove them from fileTree, as they didn't change
  for (const file1 in webdavFiles.added){
    if(localFiles.added[file1] === webdavFiles.added[file1]){
      

        delete webdavFiles.added[file1]
        delete localFiles.added[file1]
      } 
    else if(localFiles.added[file1]){
      // if(localFiles.added[file1] === webdavFiles.added[file1]){
      

      //   delete webdavFiles.added[file1]
      //   delete localFiles.added[file1]
      // } 
      webdavFiles.except[file1] = webdavFiles.added[file1]
      localFiles.except[file1] = localFiles.added[file1]

      delete webdavFiles.added[file1];
      delete localFiles.added[file1];
    }

  }

  // console.log("SSSSSSSSSS");

    for (const file1 in localFiles.except){
      if (localFiles.except[file1] == webdavFiles.except[file1]){
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
async function comparePreviousFileTree(previousObj, current) {
  const previous = previousObj.files
  const added = {};
  const deleted = {};
  const modified = {};
  const { removedItems, remainingItems } = checkExistKeyBoth(current, previousObj.except);
  const except = remainingItems;
  current = removedItems ;
  

  // Identify added and modified files
  for (const [currentFile, currentHash] of Object.entries(current)) {
    const matchingHash = previous[currentFile];

    if (previous[currentFile] === current[currentFile]){
      // nothing
    }else if (!matchingHash) {
      added[currentFile] = currentHash;
    } else if (matchingHash !== currentHash) {
      modified[currentFile] = currentHash;
    }
  }

  // Identify deleted files
  for (const [prevFile, prevHash] of Object.entries(previous)) {
    if (!current[prevFile] && !except[prevFile]) {
      
      if (current[prevFile] === previous[prevFile]){
        // unchanged
      } else {
        deleted[prevFile] = prevHash;
      }
    }
  }

  return { added, deleted, modified, except };
}



const checkExistKey = (sourceObject, referenceObject) => {
  return Object.fromEntries(
    Object.entries(sourceObject).filter(([key]) => key in referenceObject)
  );
};



const checkExistKeyBoth = (sourceObject={}, referenceObject={}) => {
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

const filterExclusions = (fileTree: object,  exclusions: { extensions?: string[], directories?: string[], markers?: string[] }) =>{
    const { extensions = [], directories = [], markers = [] } = exclusions;
    const filtered = {}
    
    for (const filePath in fileTree){

    const folders = filePath.split('/');
    if(!filePath.endsWith("/")){
        folders.pop();
    }
    if(folders.some(folder => directories.includes(folder))){
      console.log("filtered",filePath)
        continue
    }

    // // Check file extensions
    // const extension = extname(filePath).toLowerCase();
    // if (extensions.includes(extension)) {
    //   console.log("filtered")
    //     continue
    // }

// Check file extensions without using extname
// if (extensions && extensions.length > 0) {
const lastDotIndex = filePath.lastIndexOf('.');
if (lastDotIndex !== -1) {
    const extension = filePath.slice(lastDotIndex).toLowerCase();
    if (extensions.includes(extension)) {
      console.log("filtered",filePath)
        continue;
    }
}
// }

// if (markers && markers.length > 0) {
    // Check markers
    if (markers.some(marker => filePath.includes(marker))) {
      console.log("filtered",filePath)
        continue
    }
  // }

    filtered[filePath] = fileTree[filePath]
    }
    return filtered
  }


export const compareFileTrees = async (webdavFiles, localFiles, prevFileTree={}, exclusions: { extensions?: string[], directories?: string[], markers?: string[] }):{webdavFiles, localFiles} => {

// const files1 = Object.keys(webdavFiles)
// const files2 = Object.keys(localFiles)
// const files3 = Object.keys(prevFileTree.files)

// console.log("prevFileTree.files: ",prevFileTree.files)
// console.log("Object.keys(prevFileTree.files) > 0",Object.keys(prevFileTree.files).length > 0)

let webdavMatch, localMatch

if (prevFileTree.files &&  Object.keys(prevFileTree.files).length > 0){

  prevFileTree.files = filterExclusions(prevFileTree.files, exclusions)

  // const differingFiles = compareFileTrees(webdavFiles, localFiles);
const webdavFilesPromise = comparePreviousFileTree(prevFileTree, webdavFiles);
const localFilesPromise = comparePreviousFileTree(prevFileTree, localFiles);

[webdavFilesBranch, localFilesBranch] = await Promise.all([webdavFilesPromise, localFilesPromise]);


 ({webdavMatch, localMatch} = compareFileTreesExcept(webdavFilesBranch, localFilesBranch));


webdavMatch.deleted = checkExistKey(webdavMatch.deleted, localFiles)
localMatch.deleted  = checkExistKey(localMatch.deleted, webdavFiles)

} else {
  console.log("++ NO PREVIOUS fileTree loaded! ++")
  
  webdavFilesBranch = {added: {...webdavFiles}};
  localFilesBranch = {added: {...localFiles}};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
 ({webdavMatch, localMatch} = compareFileTreesExcept(webdavFilesBranch, localFilesBranch))

}


return { webdavFiles: webdavMatch, localFiles: localMatch}
}

