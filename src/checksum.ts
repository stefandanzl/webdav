// @ts-nocheck
import {readFileSync, readdirSync, statSync} from 'fs';
import {join, extname} from 'path';
import { createHash } from 'crypto';
// import { writeFileSync } from 'fs';
// import { configWebdav, findMatchingKeys } from './operations';
import { WebDAVClient } from 'webdav';
// import { findMatchingKeys } from './operations';



function refineObject(data, exclusions) {
    const refinedObject = {};

    data.forEach(item => {
        // console.log(item)
        const { filename, type, props } = item;

       

        const isDirectory = type === 'directory';
        const fullPath = isDirectory ? filename + '/' : filename;

        if (isExcluded(fullPath, exclusions)) {
            return; // Skip excluded files and folders
        }

        // if (props && props.checksums && props.checksums.checksum) {
        //     const checksum = props.checksums.checksum;
        if (props && props.checksum ) {
            const checksum = props.checksum;
            refinedObject[fullPath] = checksum;
        } else {
            refinedObject[fullPath] = "";
        }
    });
    return refinedObject;
}

function calculateChecksum(filePath) {
    const data = readFileSync(filePath);
    return createHash('sha1').update(data).digest('hex');
}


function processFolder(folderPath, checksumTable, exclusions, rootFolder) {
    const files = readdirSync(folderPath).sort();
    const fileChecksums = [];

    for (const file of files) {
        const filePath = join(folderPath, file).replace(/\\/g, '/');
        const isFile = statSync(filePath).isFile();

        const normFilePath = filePath.slice(rootFolder.length) + (isFile ? '' : '/') 

        // Check exclusions
        if (isExcluded(normFilePath, exclusions)) {
            continue; // Skip excluded files and folders
        }

        if (isFile) {
            const fileChecksum = calculateChecksum(filePath);
            checksumTable[filePath.slice(rootFolder.length)] = fileChecksum;
            fileChecksums.push(fileChecksum);
        } else {
            const subFolderChecksum = processFolder(filePath, checksumTable, exclusions, rootFolder);
            fileChecksums.push(subFolderChecksum);
            checksumTable[filePath.slice(rootFolder.length) + '/'] = ""; // subFolderChecksum;
        }
    }

    const folderChecksum = createHash('sha1').update(fileChecksums.join('')).digest('hex');
    return folderChecksum;
}

function isExcluded(filePath, exclusions: { extensions?: string[], directories?: string[], markers?: string[] }) {
    const { extensions = [], directories = [], markers = [] } = exclusions;

    const folders = filePath.split('/');
    if(!filePath.endsWith("/")){
        folders.pop();
    }
    if(folders.some(folder => directories.includes(folder))){
        return true
    }

    // Check file extensions
    const extension = extname(filePath).toLowerCase();
    if (extensions.includes(extension)) {
        return true;
    }

    // // Check directories
    // if (directories.some(dir => filePath.includes(dir))) {
    //     return true;
    // }

    


    // Check markers
    if (markers.some(marker => filePath.includes(marker))) {
        return true;
    }

    return false;
}

function removeBase(fileChecksums, basePath) {
    const removedBase = {};
  
    for (const [filePath, checksum] of Object.entries(fileChecksums)) {
      // Check if the file path starts with the base path
      if (filePath.startsWith(basePath)) {
        // Remove the base path from the file path
        const relativePath = filePath.substring(basePath.length).replace(/^\//, '');
        removedBase[relativePath] = checksum;
      } else {
        // If the file path doesn't start with the base path, keep it unchanged
        removedBase[filePath] = checksum;
      }
    }
  
    return removedBase;
  }



export const generateLocalHashTree = (rootFolder: string, exclusions={}) => {
    // const rootFolder = self.basePath;
    const checksumTable = {};

    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const rootChecksum = processFolder(rootFolder, checksumTable, exclusions, rootFolder);
    

    return checksumTable
}


// Fetch directory contents from webdav
export const generateWebdavHashTree = async (client: WebDAVClient,rootFolder, exclusions={}) => {


    try {
        const exists = await client.exists(rootFolder)
        if (exists){
            // console.log("DOES EXIST")
        }
        else{ 
            console.log("DOES NOT EXIST")
            await client.createDirectory(rootFolder)
        }
    } catch (error){
        console.error("ERROR: ",error)
    }

    // exclusions.directories = exclusions.directories || [];
    // exclusions.directories.push("node_modules", ".git", "plugins/remotely-sync", "remotely-sync/src", "obsidian-cloudr");
    
    try {
        const contents = await client.getDirectoryContents(rootFolder, { deep: true, details: true });   //details: true
        // console.log("Contents:", JSON.stringify(contents));
        // writeFileSync("out/output-webdav1.json", JSON.stringify(contents, null, 2));

        const refinedResult = refineObject(contents.data, exclusions);

        const webdavHashtree = removeBase(refinedResult, rootFolder)
        // writeFileSync("out/output-webdav2.json", JSON.stringify(refinedResult, null, 2));
        // console.log("webdav: ",webdavHashtree)
        return webdavHashtree
    } catch (error) {
        console.error("Error:", error);
        return error
    }
}


